# YouTube Watch Marker

A lightweight Chrome Extension (Manifest V3) that lets you mark YouTube videos as watched or save your current timestamp directly from the popup player. Badges are displayed on channel **Videos** tabs to help you keep track of what you've seen.

## Features

- **Mark as Watched:** Flag any YouTube video as watched with a single click.
- **Save Timestamps:** Save your current playback position (e.g., `⏱ 12:34`) to resume or reference later.
- **Channel /Videos Integration:** Displays `✓ Watched` or timestamp badges alongside video metadata on channel pages.
- **Import / Export:** Backup or transfer your saved history as a JSON file across browsers or devices.
- **Clean UI:** Contextual popup interface that dynamically updates based on whether you're viewing a video or browsing a channel.

## Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click **Load unpacked** and select the extension root directory.

## File Structure

```text
YouTube Watch Marker/
├── assets/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── scripts/
│   └── content.js
├── .gitignore
├── manifest.json
└── README.md
```

## How It Works

- **Storage:** Marks are stored locally in Chrome's extension storage (`chrome.storage.local`) keyed by YouTube video IDs (`v:<videoId>`).
- **Content Script:** Detects video metadata rows on YouTube channel `/videos` tabs and injects matching badges using DOM mutations.
- **Popup Interface:** Reads the active tab state to offer contextual actions (Mark Watched, Save Timestamp, Clear, or Export/Import).
