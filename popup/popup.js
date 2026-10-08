(() => {
  'use strict';

  const PREFIX = 'v:';
  const $ = (id) => document.getElementById(id);
  const tabMode = new URLSearchParams(location.search).has('import');

  let tabId = null;
  let videoId = null;
  let current = null;

  function fmt(total) {
    const s = Math.max(0, Math.floor(total));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  const describe = (mark) =>
    !mark ? 'Not Marked' : mark.s === 'w' ? '✓ Watched' : `⏱ Watched Till ${fmt(mark.t)}`;

  const say = (text) => { $('msg').textContent = text; };

  function paint() {
    $('state').textContent = describe(current);

    // Hide "Clear" if there's no mark saved yet
    $('clear').style.display = current ? 'block' : 'none';

    // Hide "Mark as watched" button if already marked as watched
    $('watched').style.display = current?.s === 'w' ? 'none' : 'block';
  }

  async function load() {
    const key = PREFIX + videoId;
    current = (await chrome.storage.local.get(key))[key] || null;
    paint();
  }

  async function currentTime() {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const player = document.querySelector('.html5-video-player');
        if (player && player.classList.contains('ad-showing')) return { ad: true };
        const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
        return v ? { t: v.currentTime } : {};
      },
    });
    return (res && res.result) || {};
  }

  async function save(mark) {
    await chrome.storage.local.set({ [PREFIX + videoId]: mark });
    current = mark;
    paint();
  }

  async function onWatched() {
    await save({ s: 'w', at: Date.now() });
    say('Saved ✓ Watched');
  }

  async function onTimestamp() {
    const { t, ad } = await currentTime();
    if (ad) return say('An ad is playing. Try again when the video resumes.');
    if (typeof t !== 'number' || Number.isNaN(t)) return say('Could not read the video time.');
    const sec = Math.floor(t);
    await save({ s: 't', t: sec, at: Date.now() });
    say(`Saved ⏱ ${fmt(sec)}`);
  }

  async function onClear() {
    await chrome.storage.local.remove(PREFIX + videoId);
    current = null;
    paint();
    say("Cleared this video's history");
  }

  async function onExport() {
    const all = await chrome.storage.local.get(null);
    const marks = {};
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith(PREFIX)) marks[k.slice(PREFIX.length)] = v;
    }
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
        if (ok) entries[PREFIX + id] = m;
      }
      await chrome.storage.local.set(entries);
      say(`Imported ${Object.keys(entries).length} videos`);
      if (videoId) await load();
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

  async function init() {
    $('watched').addEventListener('click', onWatched);
    $('timestamp').addEventListener('click', onTimestamp);
    $('clear').addEventListener('click', onClear);
    $('export').addEventListener('click', onExport);
    $('import').addEventListener('click', onImport);
    $('file').addEventListener('change', onFile);

    if (tabMode) {
      document.body.classList.add('tab');
      $('mark').style.display = 'none';
      say('Choose a JSON file from a previous export. Imported marks overwrite matching videos.');
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let id = null;
    try {
      const u = new URL(tab.url);
      if (u.hostname === 'www.youtube.com' && u.pathname === '/watch') id = u.searchParams.get('v');
    } catch { /* no usable URL */ }

    if (!id) {
      $('state').style.display = 'none';
      $('actions').style.display = 'none';
      $('hint').hidden = false;
      return;
    }
    tabId = tab.id;
    videoId = id;
    await load();
  }

  init();
})();
