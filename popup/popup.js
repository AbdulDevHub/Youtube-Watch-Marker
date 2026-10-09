(() => {
  'use strict';

  const { ACTIONS, icon, describe, keyOf, loadMark, loadAll, readPlayerTime, applyAction } = YTWM;

  const $ = (id) => document.getElementById(id);
  const tabMode = new URLSearchParams(location.search).has('import');

  let tabId = null;
  let videoId = null;
  let current = null;
  const buttons = {};

  const say = (text) => { $('msg').textContent = text; };

  // ---- rendering --------------------------------------------------------
  function paint() {
    $('state').textContent = describe(current);
    $('chip').dataset.kind = current ? current.s : 'none';
    $('chip').innerHTML = icon(current ? (current.s === 'w' ? 'check' : 'clock') : 'unmarked');

    buttons.clear.hidden = !current;          // nothing to clear yet
    buttons.w.hidden = current?.s === 'w';    // already marked watched
  }

  function buildActions() {
    for (const a of ACTIONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = a.danger ? 'action danger' : 'action';
      b.innerHTML = `${icon(a.icon)}<span>${a.label}</span>`;
      b.addEventListener('click', () => run(a.id));
      buttons[a.id] = b;
      $('actions').append(b);
    }
  }

  // ---- marking ----------------------------------------------------------
  async function readTabTime() {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: readPlayerTime });
    return (res && res.result) || {};
  }

  async function run(actionId) {
    const result = await applyAction(actionId, videoId, readTabTime);
    if (result.changed) {
      current = result.mark;
      paint();
    }
    say(result.message);
  }

  // ---- export / import --------------------------------------------------
  async function onExport() {
    const marks = Object.fromEntries(await loadAll());
    const blob = new Blob([JSON.stringify({ version: 1, marks }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `youtube-marks-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    say(`Exported ${Object.keys(marks).length} videos`);
  }

  async function onFile() {
    const file = $('file').files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const entries = {};
      for (const [id, m] of Object.entries(data.marks || {})) {
        const ok = m && (m.s === 'w' || (m.s === 't' && Number.isFinite(m.t)));
        if (ok) entries[keyOf(id)] = m;
      }
      await chrome.storage.local.set(entries);
      say(`Imported ${Object.keys(entries).length} videos`);
      if (videoId) {
        current = await loadMark(videoId);
        paint();
      }
    } catch {
      say('That file is not a valid export.');
    }
    $('file').value = '';
  }

  function onImport() {
    if (tabMode) {
      $('file').click();
    } else {
      // The file picker closes the popup in Chrome, so import runs in a full tab.
      chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html?import=1') });
    }
  }

  // ---- startup ----------------------------------------------------------
  async function watchedVideoId(tab) {
    try {
      const u = new URL(tab.url);
      if (u.hostname === 'www.youtube.com' && u.pathname === '/watch') return u.searchParams.get('v');
    } catch { /* no usable URL */ }
    return null;
  }

  async function init() {
    document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
    buildActions();
    $('export').addEventListener('click', onExport);
    $('import').addEventListener('click', onImport);
    $('file').addEventListener('change', onFile);

    if (tabMode) {
      document.body.classList.add('tab');
      $('mark').hidden = true;
      say('Choose a JSON file from a previous export. Imported marks overwrite matching videos.');
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    videoId = await watchedVideoId(tab);
    if (!videoId) {
      $('mark').hidden = true;
      $('empty').hidden = false;
      return;
    }
    tabId = tab.id;
    current = await loadMark(videoId);
    paint();
  }

  init();
})();
