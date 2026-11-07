# Progress Tracker

Running record of where this project stands, for AI agents and the owner picking up a new session.
Update it after any meaningful change: refresh "Current state", "In progress" and "Next steps",
and add a dated entry at the top of the session log. When old entries stop being useful, collapse
them into the "Earlier history" paragraph instead of deleting them.

## Current state

- Mark watched / save timestamp / clear, from the popup and from an in-player menu (button in the player's top-right).
- Badges ("✓ Marked Watched", "⏱ Watched Till m:ss") on channel /videos tabs.
- Popup has a collapsible saved-timestamps list with count and video titles; import/export as JSON.
- When a video ends, it is auto-marked watched (overwriting a saved timestamp), the player menu opens automatically and the player button stays visible and correctly placed.
- `/feed/channels` shows "● New video" / "✓ Up to date" per channel, from each channel's latest video (cached 24h).
- The player button turns light green while the current video is marked watched.
- Clicking a timestamped video on a /videos tab resumes at the saved time (links get `&t=Ns`).
- `/feed/history` shows a "Saved timestamps" card grid (thumbnail with time badge, title, resume time, hover remove button) in the main column; YouTube's empty-history message is hidden.
- Repo SEO: keyworded README title/intro, GitHub description and topics, `assets/og-image.png` (1280x640).
- Version 1.2.0.

## In progress

- Owner to upload `assets/og-image.png` as the repo social preview (GitHub Settings > Social preview; no API for it) and to try the resume-on-click in a browser.
- Owner to reload the extension and confirm the green player icon (not yet seen in a browser).

## Next steps

- Verify an ad ending doesn't auto-mark.

## Session log

- 2026-11-06 (later): Saved-timestamps panel on /feed/history (`historyPanel` in `content.js`), so the list is reachable with the extension unpinned. Title fetch and list sorting moved to `shared.js` for reuse by the popup. First placed in the right sidebar; the owner wanted it in the empty main column (they keep watch history off), so it is now a card grid there and YouTube's "no videos" message is hidden. Checked in the owner's Chrome with 4 saved videos; remove button not clicked. Added `screenshots/Watch History.png` to the README.

- 2026-11-06: Resume-on-click for timestamped cards on /videos (`badges.resumeLinks`, syntax-checked only). GitHub SEO: README title and intro, repo description and topics, OG image.

- 2026-10-30 (later): Added an MIT `LICENSE` (Abdul Khan, 2026) with a License section in `README.md`; screenshots table is now 2x2 so the images render larger.

- 2026-10-30: Added a Screenshots table to `README.md` (four images from `screenshots/`, including the toolbar popup) and listed the folder in its file structure.

- 2026-10-29 (later): Owner confirmed auto-mark and the channel pills work. Player button now turns light green (`.ytwm-watched`, set by `playerMenu.paintButton`) when the video is watched. Channel pills are purple and absolutely positioned inside `#info-section` (a flex row), because as a flex item they pushed the Subscribed button left.

- 2026-10-29: Added auto-mark on video end and new-video badges on /feed/channels (`channelCheck` in `content.js`, 24h cache under `latest:<@handle>`). Parsing of `ytInitialData` was checked against @mkbhd; syntax-checked only, UI untouched by a browser run.
- 2026-10-22: Fixed the player button vanishing when a video ends. The menu now auto-opens on the `ended` event. The button's overlay container is forced visible under `.ended-mode`, with explicit top-right positioning (forcing `display: block` had moved it to the top-left). Confirmed working by the owner. Added AGENTS.md and this tracker.

## Earlier history

Popup and content scripts were refactored for readability, then gained collapsible saved timestamps with a count badge, button accessibility improvements, and a fix to show the icon on the /videos page.
