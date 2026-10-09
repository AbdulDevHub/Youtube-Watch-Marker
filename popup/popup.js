;(() => {
  "use strict"

  // ----------------------------- GLOBAL VARIABLES -----------------------------
  const { ACTIONS, icon, describe, keyOf, loadMark, loadAll, readPlayerTime, applyAction } = YTWM

  const state = {
    tabId: null,
    videoId: null,
    current: null, // mark for the open video, null when unmarked
    isTabMode: new URLSearchParams(location.search).has("import"), // import runs in a full tab
    actionButtons: {}, // action id -> button, filled by ui.buildActions()
  }

  const elements = {
    message: document.querySelector("#msg"),
    stateText: document.querySelector("#state"),
    chip: document.querySelector("#chip"),
    actions: document.querySelector("#actions"),
    exportButton: document.querySelector("#export"),
    importButton: document.querySelector("#import"),
    fileInput: document.querySelector("#file"),
    markSection: document.querySelector("#mark"),
    emptyNotice: document.querySelector("#empty"),
  }

  // ----------------------------- UTILITIES -----------------------------
  const utils = {
    async getWatchedVideoId(tab) {
      try {
        const url = new URL(tab.url)
        if (url.hostname === "www.youtube.com" && url.pathname === "/watch") {
          return url.searchParams.get("v")
        }
      } catch {
        // No usable URL
      }
      return null
    },
  }

  // ----------------------------- UI -----------------------------
  const ui = {
    say(text) {
      elements.message.textContent = text
    },

    paint() {
      let iconName = "unmarked"
      if (state.current) iconName = state.current.s === "w" ? "check" : "clock"

      elements.stateText.textContent = describe(state.current)
      elements.chip.dataset.kind = state.current ? state.current.s : "none"
      elements.chip.innerHTML = icon(iconName)

      state.actionButtons.clear.disabled = !state.current // nothing to clear yet
      state.actionButtons.w.disabled = state.current?.s === "w" // already marked watched
    },

    buildActions() {
      for (const action of ACTIONS) {
        const button = document.createElement("button")
        button.type = "button"
        button.className = action.danger ? "action danger" : "action"
        button.innerHTML = `${icon(action.icon)}<span>${action.label}</span>`
        button.addEventListener("click", () => marking.run(action.id))
        state.actionButtons[action.id] = button
        elements.actions.append(button)
      }
    },
  }

  // ----------------------------- MARKING -----------------------------
  const marking = {
    async readTabTime() {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: state.tabId },
        func: readPlayerTime,
      })
      return (res && res.result) || {}
    },

    async run(actionId) {
      const result = await applyAction(actionId, state.videoId, marking.readTabTime)
      if (result.changed) {
        state.current = result.mark
        ui.paint()
        ui.say("")
      } else {
        ui.say(result.message)
      }
    },
  }

  // ----------------------------- EXPORT / IMPORT -----------------------------
  const backup = {
    async exportMarks() {
      const marks = Object.fromEntries(await loadAll())
      const blob = new Blob([JSON.stringify({ version: 1, marks }, null, 2)], {
        type: "application/json",
      })
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = `youtube-marks-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(link.href)
      ui.say(`Exported ${Object.keys(marks).length} videos`)
    },

    async handleFile() {
      const file = elements.fileInput.files[0]
      if (!file) return
      try {
        const data = JSON.parse(await file.text())
        const entries = {}
        for (const [id, mark] of Object.entries(data.marks || {})) {
          const isValid = mark && (mark.s === "w" || (mark.s === "t" && Number.isFinite(mark.t)))
          if (isValid) entries[keyOf(id)] = mark
        }
        await chrome.storage.local.set(entries)
        ui.say(`Imported ${Object.keys(entries).length} videos`)
        if (state.videoId) {
          state.current = await loadMark(state.videoId)
          ui.paint()
        }
      } catch {
        ui.say("That file is not a valid export.")
      }
      elements.fileInput.value = ""
    },

    startImport() {
      if (state.isTabMode) {
        elements.fileInput.click()
      } else {
        // The file picker closes the popup in Chrome, so import runs in a full tab.
        chrome.tabs.create({ url: chrome.runtime.getURL("popup/popup.html?import=1") })
      }
    },
  }

  // ----------------------------- INITIALIZATION -----------------------------
  function initializeIcons() {
    document.querySelectorAll("[data-icon]").forEach((el) => {
      el.innerHTML = icon(el.dataset.icon)
    })
  }

  async function initializePopup() {
    if (state.isTabMode) {
      document.body.classList.add("tab")
      elements.markSection.hidden = true
      ui.say("Choose a JSON file from a previous export. Imported marks overwrite matching videos.")
      return
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    state.videoId = await utils.getWatchedVideoId(tab)
    if (!state.videoId) {
      elements.markSection.hidden = true
      elements.emptyNotice.hidden = false
      return
    }
    state.tabId = tab.id
    state.current = await loadMark(state.videoId)
    ui.paint()
  }

  function initializeEventListeners() {
    // ============= EXPORT / IMPORT EVENTS =============
    elements.exportButton.addEventListener("click", backup.exportMarks)
    elements.importButton.addEventListener("click", backup.startImport)
    elements.fileInput.addEventListener("change", backup.handleFile)
  }

  function initialize() {
    initializeIcons()
    ui.buildActions()
    initializeEventListeners()
    initializePopup()
  }

  initialize()
})()