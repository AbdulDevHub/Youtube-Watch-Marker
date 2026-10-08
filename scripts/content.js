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
  let activeMenu = null;

  function fmt(total) {
    const s = Math.max(0, Math.floor(total));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  const onVideosTab = () => /\/videos\/?$/.test(location.pathname);

  function badgeText(mark) {
    return mark.s === 'w' ? '✓ Watched' : `⏱ Watched Till ${fmt(mark.t)}`;
  }

  function getCurrentVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v');
  }

  function getCurrentVideoTime() {
    const video = document.querySelector('video');
    return video ? Math.floor(video.currentTime) : 0;
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

  function closeMenu() {
    if (activeMenu) {
      activeMenu.remove();
      activeMenu = null;
    }
  }

  function createMenu() {
    closeMenu();

    const videoId = getCurrentVideoId();
    if (!videoId) return;

    const currentMark = marks.get(videoId);
    const playerContainer = document.querySelector('#movie_player') || document.body;

    const menu = document.createElement('div');
    menu.id = 'ytwm-inline-menu';
    Object.assign(menu.style, {
      position: 'absolute',
      top: '52px',
      right: '16px',
      width: 'max-content',
      padding: '8px',
      borderRadius: '8px',
      background: 'rgba(24, 24, 24, 0.95)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
      color: '#fff',
      fontFamily: 'Roboto, Arial, sans-serif',
      fontSize: '12px',
      zIndex: '999999999',
      display: 'flex',
      flexDirection: 'column',
      gap: '5px',
    });

    const statusText = currentMark ? badgeText(currentMark) : 'Not Marked';

    const clearBtnHtml = currentMark
      ? `<button id="ytwm-action-clear" style="
          background: rgba(255, 85, 85, 0.15);
          border: none;
          color: #ff6b6b;
          padding: 6px 8px;
          border-radius: 5px;
          cursor: pointer;
          text-align: left;
          font-size: 12px;
          white-space: nowrap;
        ">
          ✕ Clear Mark
        </button>`
      : '';

    menu.innerHTML = `
      <div style="font-weight: 600; font-size: 11px; color: #888; padding: 2px 4px; white-space: nowrap;">
        ${statusText}
      </div>
      <button id="ytwm-action-watched" style="
        background: rgba(255,255,255,0.08);
        border: none;
        color: #fff;
        padding: 6px 8px;
        border-radius: 5px;
        cursor: pointer;
        text-align: left;
        font-size: 12px;
        white-space: nowrap;
      ">
        ✓ ${currentMark && currentMark.s === 'w' ? 'Unmark Watched' : 'Mark Watched'}
      </button>
      <button id="ytwm-action-timestamp" style="
        background: rgba(255,255,255,0.08);
        border: none;
        color: #fff;
        padding: 6px 8px;
        border-radius: 5px;
        cursor: pointer;
        text-align: left;
        font-size: 12px;
        white-space: nowrap;
      ">
        ⏱ Save Timestamp
      </button>
      ${clearBtnHtml}
    `;

    menu.querySelector('#ytwm-action-watched').addEventListener('click', () => {
      const key = `${PREFIX}${videoId}`;
      if (currentMark && currentMark.s === 'w') {
        chrome.storage.local.remove(key);
      } else {
        chrome.storage.local.set({ [key]: { s: 'w' } });
      }
      closeMenu();
    });

    menu.querySelector('#ytwm-action-timestamp').addEventListener('click', () => {
      const t = getCurrentVideoTime();
      const key = `${PREFIX}${videoId}`;
      chrome.storage.local.set({ [key]: { s: 't', t } });
      closeMenu();
    });

    const clearBtn = menu.querySelector('#ytwm-action-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const key = `${PREFIX}${videoId}`;
        chrome.storage.local.remove(key);
        closeMenu();
      });
    }

    playerContainer.appendChild(menu);
    activeMenu = menu;
  }

  document.addEventListener('click', (e) => {
    if (activeMenu && !activeMenu.contains(e.target) && !e.target.closest('#ytwm-player-btn')) {
      closeMenu();
    }
  });

  function injectPlayerButton() {
    if (!window.location.href.includes('/watch')) return;
    if (document.getElementById('ytwm-player-btn')) return;

    const cardsContainer = document.querySelector('.ytp-chrome-top-buttons');
    if (!cardsContainer) return;

    const btn = document.createElement('button');
    btn.id = 'ytwm-player-btn';
    btn.className = 'ytp-button';
    btn.title = 'Watch Marker';
    btn.setAttribute('aria-label', 'Watch Marker');
    btn.style.cssText = `
      display: inline-block;
      width: 36px;
      height: 36px;
      padding: 0;
      margin: 0;
      background: transparent;
      border: none;
      cursor: pointer;
      vertical-align: middle;
    `;

    btn.innerHTML = `
      <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
        <path class="ytp-svg-shadow" d="M18,8 C12.47,8 8,12.47 8,18 8,23.52 12.47,28 18,28 23.52,28 28,23.52 28,18 28,12.47 23.52,8 18,8 Z m-1,15 l-5-5 1.41-1.41 L17,20.17 l7.59-7.59 L26,14 l-9,9 z"></path>
        <path class="ytp-svg-fill" d="M 18,8 C 12.47,8 8,12.47 8,18 8,23.52 12.47,28 18,28 23.52,28 28,23.52 28,18 28,12.47 23.52,8 18,8 z m -1,15 -5,-5 1.41,-1.41 L 17,20.17 24.59,12.58 26,14 z" fill="#ffffff"></path>
      </svg>
    `;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (activeMenu) {
        closeMenu();
      } else {
        createMenu();
      }
    });

    const infoBtn = cardsContainer.querySelector('.ytp-cards-button');
    if (infoBtn) {
      cardsContainer.insertBefore(btn, infoBtn);
    } else {
      cardsContainer.appendChild(btn);
    }
  }

  function scan() {
    timer = null;
    injectPlayerButton();

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
    if (timer === null) timer = setTimeout(scan, 100);
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

  document.addEventListener('yt-navigate-finish', () => {
    closeMenu();
    schedule();
  });
  document.addEventListener('DOMContentLoaded', schedule);
})();
