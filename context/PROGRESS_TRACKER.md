# Progress Tracker

Running record of where this project stands, for AI agents and the owner picking up a new session.
Update it after any meaningful change: refresh "Current state", "In progress" and "Next steps",
and add a dated entry at the top of the session log. When old entries stop being useful, collapse
them into the "Earlier history" paragraph instead of deleting them.

## Current state

- Mark watched / save timestamp / clear, from the popup and from an in-player menu (button in the player's top-right).
- Badges ("✓ Marked Watched", "⏱ Watched Till m:ss") on channel /videos tabs.
- Popup has a collapsible saved-timestamps list with count and video titles; import/export as JSON.
- When a video ends, the player menu opens automatically and the player button stays visible and correctly placed.
- Version 1.1.0.

## In progress

- Nothing.

## Next steps

- None planned.

## Session log

- 2026-10-22: Fixed the player button vanishing when a video ends. The menu now auto-opens on the `ended` event. The button's overlay container is forced visible under `.ended-mode`, with explicit top-right positioning (forcing `display: block` had moved it to the top-left). Confirmed working by the owner. Added AGENTS.md and this tracker.

## Earlier history

Popup and content scripts were refactored for readability, then gained collapsible saved timestamps with a count badge, button accessibility improvements, and a fix to show the icon on the /videos page.
