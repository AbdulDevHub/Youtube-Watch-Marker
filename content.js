// Adds "✓ Watched" / "⏱ m:ss" badges to the views/date row of video cards
// on a channel's /videos tab. Marks live in chrome.storage.local under "v:<videoId>".
(() => {
  'use strict';

  const PREFIX = 'v:';
  const CARD_SEL = 'yt-lockup-view-model, ytd-grid-video-renderer, ytd-rich-grid-media';
  const ROW_SEL = '.ytContentMetadataViewModelMetadataRow, #metadata-line';
  const TEXT_SEL = '.ytContentMetadataViewModelMetadataText, span.inline-metadata-item';
  const DELIM_SEL = '.ytContentMetadataViewModelDelimiter';

  const marks = new Map();
  let timer = null;
  let dirty = false; // true if we've injected badges that need cleanup when leaving /videos

  function fmt(total) {
    const s = Math.max(0, Math.floor(total));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  const onVideosTab = () => /\/videos\/?$/.test(location.pathname);

  function badgeText(mark) {
    return mark.s === 'w' ? '✓ Watched' : `⏱ ${fmt(mark.t)}`;
  }

  function videoIdOf(card) {
    const a = card.querySelector('a[href*="/watch?v="]');
    if (!a) return null;
    try {
      return new URL(a.getAttribute('href'), location.origin).searchParams.get('v');
    } catch {
      return null;
    }
  }

  function clearRow(row) {
    row.querySelectorAll('[data-ytwm], [data-ytwm-sep]').forEach((n) => n.remove());
  }

  function render(card) {
    const rows = card.querySelectorAll(ROW_SEL);
    const row = rows[rows.length - 1]; // views/date row is the last metadata row
    if (!row) return;

    const id = videoIdOf(card);
    const mark = id ? marks.get(id) : null;
    const want = mark ? badgeText(mark) : null;

    const existing = row.querySelector('[data-ytwm]');
    if (existing && existing.dataset.ytwm === want) return; // already correct
    if (!existing && !want) return;

    clearRow(row);
    if (!want) return;

    const texts = row.querySelectorAll(TEXT_SEL);
    const last = texts[texts.length - 1];
    const delim = row.querySelector(DELIM_SEL);

    // Clone YouTube's own date span so the badge inherits its font, size and color.
    const span = last ? last.cloneNode(false) : document.createElement('span');
    span.removeAttribute('aria-label');
    span.textContent = want;
    span.dataset.ytwm = want;

    if (delim) {
      const sep = delim.cloneNode(true);
      sep.dataset.ytwmSep = '1';
      row.append(sep);
    } else {
      span.style.marginInlineStart = '0.5em';
    }
    row.append(span);
    dirty = true;
  }

  function scan() {
    timer = null;
    if (!onVideosTab()) {
      if (dirty) {
        document.querySelectorAll('[data-ytwm], [data-ytwm-sep]').forEach((n) => n.remove());
        dirty = false;
      }
      return;
    }
    document.querySelectorAll(CARD_SEL).forEach(render);
  }

  function schedule() {
    if (timer === null) timer = setTimeout(scan, 120);
  }

  // Initial load of all saved marks.
  chrome.storage.local.get(null).then((all) => {
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith(PREFIX)) marks.set(k.slice(PREFIX.length), v);
    }
    schedule();
  });

  // Live updates when a mark changes (popup, import, or another tab).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [k, { newValue }] of Object.entries(changes)) {
      if (!k.startsWith(PREFIX)) continue;
      const id = k.slice(PREFIX.length);
      if (newValue) marks.set(id, newValue);
      else marks.delete(id);
    }
    schedule();
  });

  // YouTube is a single-page app: re-scan on DOM changes and navigations.
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  document.addEventListener('yt-navigate-finish', schedule);
})();
