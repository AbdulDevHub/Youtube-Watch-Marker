// Adds "✓ Watched" / "⏱ m:ss" badges to the views/date row of video cards on a
// channel's /videos tab, and an in-player menu on watch pages for marking videos.
// Depends on scripts/shared.js (global YTWM).
(() => {
  'use strict';

  const { PREFIX, label, describe, ACTIONS, icon, loadAll, readPlayerTime, applyAction } = YTWM;

  const CARD_SEL = 'yt-lockup-view-model, ytd-grid-video-renderer, ytd-rich-grid-media';
  const ROW_SEL = '.ytContentMetadataViewModelMetadataRow, #metadata-line';
  const TEXT_SEL = '.ytContentMetadataViewModelMetadataText, span.inline-metadata-item';
  const DELIM_SEL = '.ytContentMetadataViewModelDelimiter';
  const BADGE_SEL = '[data-ytwm], [data-ytwm-sep]';

  const BTN_ID = 'ytwm-player-btn';
  const FLASH_MS = 1800;

  const marks = new Map();
  let timer = null;
  let dirty = false; // true if badges were injected and need cleanup when leaving /videos
  let menu = null;   // { el, id, status, flash, hint, flashTimer } while the player menu is open

  const onVideosTab = () => /\/videos\/?$/.test(location.pathname);
  const currentVideoId = () => new URLSearchParams(location.search).get('v');

  // ---- badges on the Videos tab ------------------------------------------
  function videoIdOf(card) {
    const a = card.querySelector('a[href*="/watch?v="]');
    if (!a) return null;
    try {
      return new URL(a.getAttribute('href'), location.origin).searchParams.get('v');
    } catch {
      return null;
    }
  }

  const clearBadges = (root) => root.querySelectorAll(BADGE_SEL).forEach((n) => n.remove());

  function render(card) {
    const rows = card.querySelectorAll(ROW_SEL);
    const row = rows[rows.length - 1]; // views/date row is the last metadata row
    if (!row) return;

    const id = videoIdOf(card);
    const mark = id ? marks.get(id) : null;
    const want = mark ? label(mark) : null;

    const existing = row.querySelector('[data-ytwm]');
    if (existing && existing.dataset.ytwm === want) return; // already correct
    if (!existing && !want) return;

    clearBadges(row);
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

  // ---- player menu -------------------------------------------------------
  const STYLES = `
    #${BTN_ID} {
      width: 36px; height: 36px; padding: 0; margin: 0;
      border: 0; background: transparent; cursor: pointer; vertical-align: middle;
      opacity: 0.75; transition: opacity 0.1s cubic-bezier(0, 0, 0.2, 1);
    }
    #${BTN_ID}:hover,
    #movie_player:has(.ytwm-menu) #${BTN_ID} { opacity: 1; }
    #${BTN_ID} svg { display: block; width: 100%; height: 100%; }

    /* Hide with the rest of the player controls, except while the menu is open. */
    .ytp-autohide:not(:has(.ytwm-menu)) #${BTN_ID},
    .ytp-user-idle:not(:has(.ytwm-menu)) #${BTN_ID} { opacity: 0 !important; pointer-events: none !important; }
    #movie_player:has(.ytwm-menu) .ytp-chrome-top { opacity: 1 !important; visibility: visible !important; }

    .ytwm-menu {
      position: absolute; top: 52px; right: 16px; z-index: 999999999;
      display: flex; flex-direction: column; gap: 8px;
      width: 192px; padding: 10px;
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
      display: grid; place-items: center; height: 40px; padding: 0;
      border: 0; border-radius: 10px; cursor: pointer;
      background: rgba(255, 255, 255, 0.1); color: #fff;
      transition: background 0.12s, color 0.12s;
    }
    .ytwm-act svg { width: 20px; height: 20px; }
    .ytwm-act:hover:not(:disabled) { background: rgba(255, 255, 255, 0.2); }
    .ytwm-act.ytwm-on { background: #fff; color: #0f0f0f; }
    .ytwm-act.ytwm-danger { color: #ff7b7b; }
    .ytwm-act.ytwm-danger:hover:not(:disabled) { background: rgba(255, 90, 90, 0.22); }
    .ytwm-act:disabled { opacity: 0.35; cursor: default; }
    .ytwm-act:focus-visible { outline: 2px solid #3ea6ff; outline-offset: 2px; }
  `;

  function injectStyles() {
    if (document.getElementById('ytwm-style')) return;
    const style = document.createElement('style');
    style.id = 'ytwm-style';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function closeMenu() {
    if (!menu) return;
    clearTimeout(menu.flashTimer);
    menu.el.remove();
    menu = null;
  }

  function paintMenu() {
    if (!menu) return;
    const mark = marks.get(menu.id) || null;
    menu.status.textContent = menu.flash ?? menu.hint ?? describe(mark);
    menu.el.querySelectorAll('.ytwm-act').forEach((b) => {
      b.classList.toggle('ytwm-on', mark?.s === b.dataset.act); // 'w' / 't' match mark.s
      if (b.dataset.act === 'clear') b.disabled = !mark;
    });
  }

  function flashMessage(text) {
    clearTimeout(menu.flashTimer);
    menu.flash = text;
    menu.flashTimer = setTimeout(() => {
      if (!menu) return;
      menu.flash = null;
      paintMenu();
    }, FLASH_MS);
  }

  async function runAction(actionId) {
    const id = menu.id;
    const result = await applyAction(actionId, id, async () => readPlayerTime());
    if (result.changed) {
      if (result.mark) marks.set(id, result.mark);
      else marks.delete(id);
      schedule();
    }
    if (menu?.id === id) {
      flashMessage(result.message);
      paintMenu();
    }
  }

  function createMenu() {
    closeMenu();
    const id = currentVideoId();
    if (!id) return;

    const el = document.createElement('div');
    el.className = 'ytwm-menu';
    el.innerHTML = `
      <div class="ytwm-status" role="status" aria-live="polite"></div>
      <div class="ytwm-actions">
        ${ACTIONS.map((a) => `
          <button type="button" class="ytwm-act${a.danger ? ' ytwm-danger' : ''}"
                  data-act="${a.id}" title="${a.label}" aria-label="${a.label}">${icon(a.icon)}</button>`).join('')}
      </div>`;

    menu = { el, id, status: el.querySelector('.ytwm-status'), flash: null, hint: null, flashTimer: null };

    const actions = el.querySelector('.ytwm-actions');
    actions.addEventListener('click', (e) => {
      const b = e.target.closest('.ytwm-act');
      if (b && !b.disabled) runAction(b.dataset.act);
    });
    // Show the hovered button's name in the status line.
    actions.addEventListener('mouseover', (e) => {
      const b = e.target.closest('.ytwm-act');
      if (b && !b.disabled) { menu.hint = b.title; paintMenu(); }
    });
    actions.addEventListener('mouseleave', () => { menu.hint = null; paintMenu(); });

    // Keep clicks inside the menu from reaching the player (pause / fullscreen).
    ['click', 'dblclick', 'mousedown'].forEach((type) => el.addEventListener(type, (e) => e.stopPropagation()));

    (document.querySelector('#movie_player') || document.body).appendChild(el);
    paintMenu();
  }

  document.addEventListener('click', (e) => {
    if (menu && !menu.el.contains(e.target) && !e.target.closest(`#${BTN_ID}`)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  function injectPlayerButton() {
    if (!location.pathname.startsWith('/watch')) return;
    if (document.getElementById(BTN_ID)) return;

    const bar = document.querySelector('.ytp-chrome-top-buttons');
    if (!bar) return;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.className = 'ytp-button';
    btn.title = 'Watch Marker';
    btn.setAttribute('aria-label', 'Watch Marker');
    // Outlined ring + check, drawn to match YouTube's own "i" button. The check is
    // centred on the ring's centre (18, 18).
    btn.innerHTML = `
      <svg viewBox="0 0 36 36" fill="none" stroke="#fff" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="18" cy="18" r="9"/>
        <path d="M13.5 17.9l3.2 3.2 5.8-6.2"/>
      </svg>`;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (menu) closeMenu();
      else createMenu();
    });

    bar.insertBefore(btn, bar.querySelector(':scope > .ytp-cards-button'));
  }

  // ---- scan / sync -------------------------------------------------------
  function scan() {
    timer = null;
    injectStyles();
    injectPlayerButton();

    if (!onVideosTab()) {
      if (dirty) {
        clearBadges(document);
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
  loadAll().then((saved) => {
    saved.forEach((mark, id) => marks.set(id, mark));
    schedule();
  });

  // Live updates when a mark changes (popup, import, player menu, or another tab).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [k, { newValue }] of Object.entries(changes)) {
      if (!k.startsWith(PREFIX)) continue;
      const id = k.slice(PREFIX.length);
      if (newValue) marks.set(id, newValue);
      else marks.delete(id);
    }
    paintMenu();
    schedule();
  });

  // YouTube is a single-page app: re-scan on DOM changes and navigations.
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('yt-navigate-finish', () => {
    closeMenu();
    schedule();
  });
})();
