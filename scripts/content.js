// Adds "✓ Watched" / "⏱ m:ss" badges to the views/date row of video cards on a
// channel's /videos tab, and an in-player menu on watch pages for marking videos.
// Depends on scripts/shared.js (global YTWM).
;(() => {
  "use strict"

  // ----------------------------- GLOBAL VARIABLES -----------------------------
  const { PREFIX, label, describe, ACTIONS, icon, loadAll, readPlayerTime, applyAction } = YTWM

  const preferences = {
    scanDelayMs: 100, // debounce between DOM changes and a re-scan
    flashMs: 1800, // how long a confirmation stays in the menu status line
    channelCacheMs: 24 * 60 * 60 * 1000, // how long a channel's latest video id is reused
    channelConcurrency: 3, // simultaneous /videos page fetches on the channels feed
  }

  const state = {
    marks: new Map(), // videoId -> mark
    scanTimer: null,
    hasBadges: false, // true if badges were injected and need cleanup when leaving their page
    menu: null, // { el, id, status, flash, flashTimer } while the player menu is open
    marking: new Set(), // video ids with an auto-mark save in flight
    channels: {
      latest: new Map(), // "@handle" -> id of the channel's newest video
      requested: new Set(), // handles already queued during this visit to /feed/channels
      queue: [],
      active: 0,
    },
  }

  // No cached `elements`: YouTube rebuilds its DOM on navigation, so lookups stay on demand
  const BUTTON_ID = "ytwm-player-btn"
  const STYLE_ID = "ytwm-style"
  const LATEST_PREFIX = "latest:" // storage key: latest:<@handle> -> { id, at }

  const SELECTORS = {
    card: "yt-lockup-view-model, ytd-grid-video-renderer, ytd-rich-grid-media",
    row: ".ytContentMetadataViewModelMetadataRow, #metadata-line",
    text: ".ytContentMetadataViewModelMetadataText, span.inline-metadata-item",
    delimiter: ".ytContentMetadataViewModelDelimiter",
    badge: "[data-ytwm], [data-ytwm-sep], [data-ytwm-chan]",
    channelRow: "ytd-channel-renderer",
  }

  const STYLES = `
    #${BUTTON_ID} {
      width: 36px; height: 36px; padding: 0; margin: 0;
      border: 0; background: transparent; cursor: pointer; vertical-align: middle;
      opacity: 0.75; transition: opacity 0.1s cubic-bezier(0, 0, 0.2, 1);
    }
    #${BUTTON_ID}:hover,
    #movie_player:has(.ytwm-menu) #${BUTTON_ID},
    #movie_player.ended-mode #${BUTTON_ID} { opacity: 1; }
    #${BUTTON_ID} svg { display: block; width: 100%; height: 100%; }

    /* Hide with the rest of the player controls, except while the menu is open or the video has ended. */
    .ytp-autohide:not(:has(.ytwm-menu), .ended-mode) #${BUTTON_ID},
    .ytp-user-idle:not(:has(.ytwm-menu), .ended-mode) #${BUTTON_ID} { opacity: 0 !important; pointer-events: none !important; }
    #movie_player:is(.ended-mode, :has(.ytwm-menu)) .ytp-chrome-top {
      display: flex !important; opacity: 1 !important; visibility: visible !important;
    }
    /* The button lives in the overlays container, which YouTube hides once the video ends. */
    #movie_player.ended-mode :is(.ytp-overlays-container, .ytp-overlay-top-right, .ytp-chrome-top-buttons) {
      display: block !important; opacity: 1 !important; visibility: visible !important;
    }
    #movie_player.ended-mode .ytp-overlays-container { z-index: 70 !important; }
    #movie_player.ended-mode .ytp-overlay-top-right {
      position: absolute !important; top: 0 !important; right: 0 !important; left: auto !important;
    }
    #movie_player.ended-mode .ytp-chrome-top-buttons { display: flex !important; justify-content: flex-end; }
    #movie_player.ended-mode #${BUTTON_ID} {
      display: inline-block !important; visibility: visible !important; pointer-events: auto !important;
    }

    .ytwm-menu {
      position: absolute; top: 52px; right: 16px; z-index: 999999999;
      display: flex; flex-direction: column; gap: 8px;
      width: 148px; padding: 10px;
      border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 14px;
      background: rgba(28, 28, 28, 0.92); backdrop-filter: blur(12px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      color: #fff; font: 500 12px/1.3 Roboto, Arial, sans-serif;
      cursor: default; user-select: none;
      animation: ytwm-pop 0.12s ease-out;
    }
    @keyframes ytwm-pop { from { opacity: 0; transform: translateY(-4px); } }
    @media (prefers-reduced-motion: reduce) { .ytwm-menu { animation: none; } }

    .ytwm-status { min-height: 1.3em; padding: 0 2px; color: rgba(255, 255, 255, 0.72); }
    .ytwm-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .ytwm-act {
      display: grid; place-items: center; height: 32px; padding: 0;
      border: 0; border-radius: 10px; cursor: pointer;
      background: rgba(255, 255, 255, 0.1); color: #fff;
      transition: background 0.12s, color 0.12s;
    }
    .ytwm-act svg { width: 20px; height: 20px; }
    .ytwm-act:hover:not(:disabled) { background: rgba(255, 255, 255, 0.2); }
    .ytwm-act.ytwm-on { background: #fff; color: #0f0f0f; }
    .ytwm-act.ytwm-on:hover:not(:disabled) { background: #e8e8e8; }
    .ytwm-act.ytwm-danger { color: #ff7b7b; }
    .ytwm-act.ytwm-danger:hover:not(:disabled) { background: rgba(255, 90, 90, 0.22); }
    .ytwm-act:disabled { opacity: 0.35; cursor: default; }
    .ytwm-act:focus-visible { outline: 2px solid #3ea6ff; outline-offset: 2px; }

    .ytwm-chan {
      display: inline-block; align-self: flex-start; margin-top: 6px; padding: 2px 8px;
      border-radius: 10px; font: 500 12px/1.5 Roboto, Arial, sans-serif;
    }
    .ytwm-chan-new { background: #3ea6ff; color: #0f0f0f; }
    .ytwm-chan-seen { color: var(--yt-spec-text-secondary, #aaa); padding-left: 0; }
  `

  // ----------------------------- UTILITIES -----------------------------
  const utils = {
    isVideosTab: () => /\/videos\/?$/.test(location.pathname),

    isChannelsFeed: () => location.pathname === "/feed/channels",

    currentVideoId: () => new URLSearchParams(location.search).get("v"),
  }

  // ----------------------------- SAVED MARKS -----------------------------
  const savedMarks = {
    // A falsy mark means the video was cleared
    update(id, mark) {
      if (mark) state.marks.set(id, mark)
      else state.marks.delete(id)
    },
  }

  // ----------------------------- BADGES -----------------------------
  const badges = {
    videoIdOf(card) {
      const link = card.querySelector('a[href*="/watch?v="]')
      if (!link) return null
      try {
        return new URL(link.getAttribute("href"), location.origin).searchParams.get("v")
      } catch {
        return null
      }
    },

    clear(root) {
      root.querySelectorAll(SELECTORS.badge).forEach((node) => node.remove())
    },

    render(card) {
      const rows = card.querySelectorAll(SELECTORS.row)
      const row = rows[rows.length - 1] // views/date row is the last metadata row
      if (!row) return

      const id = badges.videoIdOf(card)
      const mark = id ? state.marks.get(id) : null
      const want = mark ? label(mark, true) : null

      const existing = row.querySelector("[data-ytwm]")
      if (existing && existing.dataset.ytwm === want) return // already correct
      if (!existing && !want) return

      badges.clear(row)
      if (!want) return

      const texts = row.querySelectorAll(SELECTORS.text)
      const last = texts[texts.length - 1]
      const delimiter = row.querySelector(SELECTORS.delimiter)

      // Clone YouTube's own date span so the badge inherits its font, size and color.
      const span = last ? last.cloneNode(false) : document.createElement("span")
      span.removeAttribute("aria-label")
      span.textContent = want
      span.dataset.ytwm = want

      if (delimiter) {
        const separator = delimiter.cloneNode(true)
        separator.dataset.ytwmSep = "1"
        row.append(separator)
      } else {
        span.style.marginInlineStart = "0.5em"
      }
      row.append(span)
      state.hasBadges = true
    },
  }

  // ----------------------------- CHANNEL CHECK -----------------------------
  // On /feed/channels, tags each subscribed channel as "New video" when its newest video has no
  // mark. The newest video comes from the channel's /videos page (fetched, then cached).
  const channelCheck = {
    handleOf(row) {
      const href = row.querySelector("a#main-link")?.getAttribute("href") || ""
      return href.match(/^\/(@[^/?#]+)/)?.[1] || null
    },

    // Id of the first video in the /videos grid (newest first), or null if it can't be found
    async fetchLatest(handle) {
      try {
        const res = await fetch(`/${handle}/videos`, { credentials: "include" })
        if (!res.ok) return null
        const json = (await res.text()).match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});<\/script>/)
        if (!json) return null
        const tabs = JSON.parse(json[1]).contents.twoColumnBrowseResultsRenderer.tabs
        const grid = tabs.find((tab) => tab.tabRenderer?.selected).tabRenderer.content.richGridRenderer
        const first = grid.contents.find((item) => item.richItemRenderer)
        const id = first.richItemRenderer.content.lockupViewModel.contentId
        return /^[\w-]{11}$/.test(id) ? id : null
      } catch {
        return null
      }
    },

    async latestFor(handle) {
      const key = LATEST_PREFIX + handle
      const cached = (await chrome.storage.local.get(key))[key]
      if (cached && Date.now() - cached.at < preferences.channelCacheMs) return cached.id
      const id = await channelCheck.fetchLatest(handle)
      if (id) await chrome.storage.local.set({ [key]: { id, at: Date.now() } })
      return id ?? cached?.id ?? null
    },

    pump() {
      const channels = state.channels
      while (channels.active < preferences.channelConcurrency && channels.queue.length) {
        const handle = channels.queue.shift()
        channels.active++
        channelCheck
          .latestFor(handle)
          .then((id) => id && channels.latest.set(handle, id))
          .finally(() => {
            channels.active--
            scanner.schedule()
            channelCheck.pump()
          })
      }
    },

    reset() {
      const channels = state.channels
      channels.latest.clear()
      channels.requested.clear()
      channels.queue.length = 0
    },

    render(row, handle) {
      const section = row.querySelector("#info-section")
      if (!section) return
      const id = state.channels.latest.get(handle)
      const want = id ? (state.marks.has(id) ? "seen" : "new") : null
      const existing = section.querySelector("[data-ytwm-chan]")
      if (existing?.dataset.ytwmChan === want) return
      existing?.remove()
      if (!want) return

      const badge = document.createElement("span")
      badge.className = `ytwm-chan ytwm-chan-${want}`
      badge.dataset.ytwmChan = want
      badge.textContent = want === "new" ? "● New video" : "✓ Up to date"
      section.append(badge)
      state.hasBadges = true
    },

    scan() {
      document.querySelectorAll(SELECTORS.channelRow).forEach((row) => {
        const handle = channelCheck.handleOf(row)
        if (!handle) return
        if (!state.channels.requested.has(handle)) {
          state.channels.requested.add(handle)
          state.channels.queue.push(handle)
          channelCheck.pump()
        }
        channelCheck.render(row, handle)
      })
    },
  }

  // ----------------------------- PLAYER MENU -----------------------------
  const playerMenu = {
    injectStyles() {
      if (document.getElementById(STYLE_ID)) return
      const style = document.createElement("style")
      style.id = STYLE_ID
      style.textContent = STYLES
      document.head.appendChild(style)
    },

    close() {
      if (!state.menu) return
      clearTimeout(state.menu.flashTimer)
      state.menu.el.remove()
      state.menu = null
    },

    paint() {
      if (!state.menu) return
      const mark = state.marks.get(state.menu.id) || null
      state.menu.status.textContent = state.menu.flash ?? describe(mark, true)
      state.menu.el.querySelectorAll(".ytwm-act").forEach((button) => {
        button.classList.toggle("ytwm-on", mark?.s === button.dataset.act) // "w" / "t" match mark.s
        if (button.dataset.act === "clear") button.disabled = !mark
      })
    },

    flash(text) {
      clearTimeout(state.menu.flashTimer)
      state.menu.flash = text
      state.menu.flashTimer = setTimeout(() => {
        if (!state.menu) return
        state.menu.flash = null
        playerMenu.paint()
      }, preferences.flashMs)
    },

    async runAction(actionId) {
      const id = state.menu.id
      const result = await applyAction(actionId, id, async () => readPlayerTime())
      if (result.changed) {
        savedMarks.update(id, result.mark)
        scanner.schedule()
      }
      if (state.menu?.id === id) {
        if (result.message) playerMenu.flash(result.message)
        playerMenu.paint()
      }
    },

    create() {
      playerMenu.close()
      const id = utils.currentVideoId()
      if (!id) return

      const el = document.createElement("div")
      el.className = "ytwm-menu"
      el.innerHTML = `
        <div class="ytwm-status" role="status" aria-live="polite"></div>
        <div class="ytwm-actions">
          ${ACTIONS.map(
            (action) => `
            <button type="button" class="ytwm-act${action.danger ? " ytwm-danger" : ""}"
                    data-act="${action.id}" title="${action.label}" aria-label="${action.label}">${icon(action.icon)}</button>`
          ).join("")}
        </div>`

      state.menu = {
        el,
        id,
        status: el.querySelector(".ytwm-status"),
        flash: null,
        flashTimer: null,
      }

      el.querySelector(".ytwm-actions").addEventListener("click", (e) => {
        const button = e.target.closest(".ytwm-act")
        if (button && !button.disabled) playerMenu.runAction(button.dataset.act)
      })

      // Keep clicks inside the menu from reaching the player (pause / fullscreen).
      ;["click", "dblclick", "mousedown"].forEach((type) => {
        el.addEventListener(type, (e) => e.stopPropagation())
      })

      ;(document.querySelector("#movie_player") || document.body).appendChild(el)
      playerMenu.paint()
    },

    toggle() {
      if (state.menu) playerMenu.close()
      else playerMenu.create()
    },

    injectButton() {
      if (!location.pathname.startsWith("/watch")) return
      if (document.getElementById(BUTTON_ID)) return

      const bar = document.querySelector(".ytp-chrome-top-buttons")
      if (!bar) return

      const button = document.createElement("button")
      button.id = BUTTON_ID
      button.className = "ytp-button"
      button.title = "Watch Marker"
      button.setAttribute("aria-label", "Watch Marker")
      // Outlined ring + check, drawn to match YouTube's own "i" button. The check is
      // centred on the ring's centre (18, 18).
      button.innerHTML = `
        <svg viewBox="0 0 36 36" fill="none" stroke="#fff" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="18" cy="18" r="9"/>
          <path d="M13.5 17.9l3.2 3.2 5.8-6.2"/>
        </svg>`

      button.addEventListener("click", (e) => {
        e.stopPropagation()
        e.preventDefault()
        playerMenu.toggle()
      })

      bar.insertBefore(button, bar.querySelector(":scope > .ytp-cards-button"))
    },
  }

  // ----------------------------- SCANNER -----------------------------
  const scanner = {
    scan() {
      state.scanTimer = null
      playerMenu.injectStyles()
      playerMenu.injectButton()

      const onChannelsFeed = utils.isChannelsFeed()
      if (onChannelsFeed) channelCheck.scan()
      else if (state.channels.requested.size) channelCheck.reset()

      if (!utils.isVideosTab()) {
        if (state.hasBadges && !onChannelsFeed) {
          badges.clear(document)
          state.hasBadges = false
        }
        return
      }
      document.querySelectorAll(SELECTORS.card).forEach(badges.render)
    },

    schedule() {
      if (state.scanTimer !== null) return
      state.scanTimer = setTimeout(scanner.scan, preferences.scanDelayMs)
    },
  }

  // ----------------------------- EVENT HANDLERS -----------------------------
  const eventHandlers = {
    handleDocumentClick: (e) => {
      if (!state.menu) return
      if (!state.menu.el.contains(e.target) && !e.target.closest(`#${BUTTON_ID}`)) {
        playerMenu.close()
      }
    },

    handleKeydown: (e) => {
      if (e.key === "Escape") playerMenu.close()
    },

    // Live updates when a mark changes (popup, import, player menu, or another tab)
    handleStorageChange: (changes, area) => {
      if (area !== "local") return
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (!key.startsWith(PREFIX)) continue
        savedMarks.update(key.slice(PREFIX.length), newValue)
      }
      playerMenu.paint()
      scanner.schedule()
    },

    // When the video finishes, mark it watched and open the menu (YouTube hides the player
    // controls then), so the mark can still be cleared. Saved timestamps are overwritten.
    // "ended" doesn't bubble, so this is registered in the capture phase.
    handleVideoEnded: async (e) => {
      if (!(e.target instanceof HTMLVideoElement)) return
      if (!location.pathname.startsWith("/watch")) return
      if (!e.target.closest("#movie_player")) return // not the main player (e.g. a preview)
      if (document.querySelector("#movie_player.ad-showing")) return // ads fire "ended" too
      const id = utils.currentVideoId()
      if (!id) return

      let autoMarked = false
      if (state.marks.get(id)?.s !== "w" && !state.marking.has(id)) {
        state.marking.add(id) // a repeated "ended" must not re-run while the save is pending
        const result = await applyAction("w", id, async () => ({})).finally(() => {
          state.marking.delete(id)
        })
        savedMarks.update(id, result.mark)
        scanner.schedule()
        autoMarked = true
      }
      if (utils.currentVideoId() !== id) return // navigated away while saving

      playerMenu.injectButton()
      if (state.menu) playerMenu.paint()
      else playerMenu.create()
      if (autoMarked && state.menu?.id === id) {
        playerMenu.flash("✓ Auto-marked watched")
        playerMenu.paint()
      }
    },

    handleNavigation: () => {
      playerMenu.close()
      scanner.schedule()
    },
  }

  // ----------------------------- INITIALIZATION -----------------------------
  // Initial load of all saved marks
  async function initializeMarks() {
    const saved = await loadAll()
    saved.forEach((mark, id) => state.marks.set(id, mark))
    scanner.schedule()
  }

  function initializeEventListeners() {
    // ============= DOCUMENT EVENTS =============
    document.addEventListener("click", eventHandlers.handleDocumentClick)
    document.addEventListener("keydown", eventHandlers.handleKeydown)
    document.addEventListener("yt-navigate-finish", eventHandlers.handleNavigation)
    document.addEventListener("ended", eventHandlers.handleVideoEnded, true)

    // ============= STORAGE EVENTS =============
    chrome.storage.onChanged.addListener(eventHandlers.handleStorageChange)

    // ============= DOM EVENTS =============
    // YouTube is a single-page app: re-scan on DOM changes and navigations.
    const observer = new MutationObserver(scanner.schedule)
    observer.observe(document.documentElement, { childList: true, subtree: true })
  }

  function initialize() {
    initializeEventListeners()
    initializeMarks()
  }

  initialize()
})()