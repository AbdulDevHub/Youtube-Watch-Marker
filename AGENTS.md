# AGENTS.md

Context file for AI coding agents working on this repo. Read it before making changes.
After any meaningful change to this project, update this file, `context/PROGRESS_TRACKER.md`,
and the "Project Overview" section of `README.md` to reflect the current state — do this
proactively, without being asked.

## Overview

Manifest V3 Chrome extension. Marks YouTube videos as watched or saves a timestamp, stored locally.
Shows badges on channel `/videos` tabs and an in-player menu on watch pages.

## Tech stack

Vanilla JavaScript, HTML, CSS. No build step, no dependencies, no package.json.
Permissions: `storage`, `scripting`; host `https://www.youtube.com/*`.

## Setup & run

- Load: `chrome://extensions` -> Developer mode -> Load unpacked -> repo root.
- After edits: click reload on the extension card, then refresh the YouTube tab.
- No tests, linter or build.

## Architecture

- `scripts/shared.js`: global `YTWM` (storage, labels, icons, `applyAction`). Loaded by the content script, and by the popup via script tag.
- `scripts/content.js`: badges on /videos cards, the player button and menu on /watch.
- `popup/`: toolbar popup (mark, saved list, import/export).
- Marks live in `chrome.storage.local` as `v:<videoId>` -> `{ s: "w", at }` or `{ s: "t", t, at }`.

## Conventions & constraints

- Style: no semicolons, double quotes, 2-space indent, ~100 columns, uppercase section banners, feature-namespaced object literals.
- Action logic lives only in `YTWM.applyAction`; the popup and the player menu both call it.
- `readPlayerTime` must stay a self-contained plain function (the popup serialises it via `chrome.scripting.executeScript`).
- YouTube rebuilds its DOM on navigation, so `content.js` looks elements up on demand and re-scans via `MutationObserver`.
- Player-end behavior relies on YouTube's `#movie_player.ended-mode` class; the button sits in `.ytp-overlay-top-right`, which YouTube hides on end, so CSS in `content.js` forces it visible. YouTube class names change, so re-check them if this breaks.
- Commits use gitmoji + conventional style, e.g. `🐛 fix: ...`.

## Boundaries

- `youtube-marks-*.json` is an exported personal data backup. Don't edit or commit new ones.

## More

- `README.md`: plain-language project overview and usage.
- `context/PROGRESS_TRACKER.md`: current state, next steps, session log.
