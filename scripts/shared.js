// Code shared by the popup and the content script. Exposes one global: YTWM.
// Marks live in chrome.storage.local under "v:<videoId>" as
//   { s: "w", at }          watched
//   { s: "t", t, at }       saved timestamp (whole seconds)
;(() => {
  "use strict"

  // ----------------------------- GLOBAL VARIABLES -----------------------------
  const PREFIX = "v:"

  // Rendered by both the popup and the player menu
  const ACTIONS = [
    { id: "w", label: "Mark As Watched", icon: "check" },
    { id: "t", label: "Save Timestamp", icon: "clock" },
    { id: "clear", label: "Clear Video History", icon: "trash", danger: true },
  ]

  const ICONS = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    trash:
      '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>',
    unmarked: '<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>',
    export: '<path d="M12 15V4m0 0L8 8m4-4l4 4"/><path d="M5 20h14"/>',
    import: '<path d="M12 4v11m0 0l-4-4m4 4l4-4"/><path d="M5 20h14"/>',
  }

  // ----------------------------- UTILITIES -----------------------------
  const utils = {
    keyOf: (id) => PREFIX + id,

    formatTime(total) {
      const s = Math.max(0, Math.floor(total))
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      const sec = String(s % 60).padStart(2, "0")
      return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`
    },

    icon(name) {
      return (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
      )
    },
  }

  // ----------------------------- LABELS -----------------------------
  const labels = {
    // `withIcon` adds the leading ✓ / ⏱ (used by the player menu; the popup omits it)
    label(mark, withIcon = false) {
      const text = mark.s === "w" ? "Marked Watched" : `Watched Till ${utils.formatTime(mark.t)}`
      const symbol = mark.s === "w" ? "✓" : "⏱"
      return withIcon ? `${symbol} ${text}` : text
    },

    describe(mark, withIcon = false) {
      if (mark) return labels.label(mark, withIcon)
      return withIcon ? "✗ Not Marked" : "Not Marked"
    },
  }

  // ----------------------------- STORAGE -----------------------------
  const storage = {
    async loadMark(id) {
      const key = utils.keyOf(id)
      return (await chrome.storage.local.get(key))[key] || null
    },

    async loadAll() {
      const all = await chrome.storage.local.get(null)
      const marks = new Map()
      for (const [key, value] of Object.entries(all)) {
        if (key.startsWith(PREFIX)) marks.set(key.slice(PREFIX.length), value)
      }
      return marks
    },

    saveMark(id, mark) {
      return chrome.storage.local.set({ [utils.keyOf(id)]: mark })
    },

    removeMark(id) {
      return chrome.storage.local.remove(utils.keyOf(id))
    },
  }

  // ----------------------------- PLAYER -----------------------------
  // Must stay self-contained (and a plain function): the popup injects it into the page with
  // chrome.scripting.executeScript, which serialises the function.
  function readPlayerTime() {
    const player = document.querySelector(".html5-video-player")
    if (player && player.classList.contains("ad-showing")) return { ad: true }
    const v = document.querySelector("video.html5-main-video") || document.querySelector("video")
    return v ? { t: v.currentTime } : {}
  }

  // ----------------------------- ACTIONS -----------------------------
  // The one place that decides what each action does.
  // `readTime` is async and returns { t } | { ad } | {}.
  // Returns { changed, mark?, message? }; `mark` is the new state (null = cleared).
  // `message` is only set for things the new state can't show (clear, errors).
  const actions = {
    async commit(videoId, mark) {
      mark.at = Date.now()
      await storage.saveMark(videoId, mark)
      return { changed: true, mark }
    },

    async applyAction(actionId, videoId, readTime) {
      if (actionId === "clear") {
        await storage.removeMark(videoId)
        return { changed: true, mark: null, message: "🗑︎ Cleared History" }
      }
      if (actionId === "w") return actions.commit(videoId, { s: "w" })

      const { t, ad } = await readTime()
      if (ad) {
        return { changed: false, message: "An ad is playing. Try again when the video resumes." }
      }
      if (!Number.isFinite(t)) return { changed: false, message: "Could not read the video time." }
      return actions.commit(videoId, { s: "t", t: Math.floor(t) })
    },
  }

  // ----------------------------- EXPORTS -----------------------------
  globalThis.YTWM = {
    PREFIX,
    ACTIONS,
    keyOf: utils.keyOf,
    fmt: utils.formatTime,
    icon: utils.icon,
    label: labels.label,
    describe: labels.describe,
    loadMark: storage.loadMark,
    loadAll: storage.loadAll,
    saveMark: storage.saveMark,
    removeMark: storage.removeMark,
    readPlayerTime,
    applyAction: actions.applyAction,
  }
})()