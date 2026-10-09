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
  }

  const state = {
    marks: new Map(), // videoId -> mark
    scanTimer: null,
    hasBadges: false, // true if badges were injected and need cleanup when leaving /videos
    menu: null, // { el, id, status, flash, flashTimer } while the player menu is open
  }

  // No cached `elements`: YouTube rebuilds its DOM on navigation, so lookups stay on demand
  const BUTTON_ID = "ytwm-player-btn"
  const STYLE_ID = "ytwm-style"

  const SELECTORS = {
    card: "yt-lockup-view-model, ytd-grid-video-renderer, ytd-rich-grid-media",
    row: ".ytContentMetadataViewModelMetadataRow, #metadata-line",
    text: ".ytContentMetadataViewModelMetadataText, span.inline-metadata-item",
    delimiter: ".ytContentMetadataViewModelDelimiter",
    badge: "[data-ytwm], [data-ytwm-sep]",
  }

  const STYLES = `
    #${BUTTON_ID} {
      width: 36px; height: 36px; padding: 0; margin: 0;
      border: 0; background: transparent; cursor: pointer; vertical-align: middle;
      opacity: 0.75; transition: opacity 0.1s cubic-bezier(0, 0, 0.2, 1);
    }
    #${BUTTON_ID}:hover,
    #movie_player:has(.ytwm-menu) #${BUTTON_ID} { opacity: 1; }
    #${BUTTON_ID} svg { display: block; width: 100%; height: 100%; }

    /* Hide with the rest of the player controls, except while the menu is open. */
    .ytp-autohide:not(:has(.ytwm-menu)) #${BUTTON_ID},
    .ytp-user-idle:not(:has(.ytwm-menu)) #${BUTTON_ID} { opacity: 0 !important; pointer-events: none !important; }
    #movie_player:has(.ytwm-menu) .ytp-chrome-top { opacity: 1 !important; visibility: visible !important; }

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
  `

  // ----------------------------- UTILITIES -----------------------------
  const utils = {
    isVideosTab: () => /\/videos\/?$/.test(location.pathname),

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
      const want = mark ? label(mark) : null

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

      if (!utils.isVideosTab()) {
        if (state.hasBadges) {
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