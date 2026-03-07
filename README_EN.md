# UISelector2AI

<p align="center">
  <img src="icons/icon128.png" alt="UISelector2AI Logo" width="128" height="128">
</p>

<p align="center">
  <strong>From webpage to AI prompt, in one click.</strong><br>
  Extract CSS selectors and HTML, convert them into AI-ready prompts for UI modifications.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/manifest-v3-green.svg" alt="Manifest V3">
  <img src="https://img.shields.io/badge/chrome-extension-yellow.svg" alt="Chrome Extension">
</p>

<p align="center">
  <a href="README.md">繁體中文</a> ·
  English
</p>

---

## ✨ Features

- 🎯 **Element Selection** — Hover to highlight any web element, click to select
- 📝 **Smart Annotations** — Add modification notes to selected elements
- 📋 **One-Click Export** — Convert annotations and context into Markdown AI prompts
- 🗂️ **Side Panel Management** — View and manage all annotations in one place
- ⌨️ **Keyboard Shortcuts** — Quick actions via Alt+O / Alt+L / Alt+X

## 🎬 Use Case

With UISelector2AI, you can quickly mark UI elements on any webpage that need modification, add specific instructions, and export all the information as an AI-friendly prompt with a single click. This greatly simplifies communication with AI Coding Agents (Claude, Cursor, ChatGPT, etc.).

## 📦 Installation

### From Source (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/benxuhuang/UISelector2AI.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the cloned project root directory

## 🚀 Quick Start

1. Click the UISelector2AI icon in the browser toolbar
2. Click **Start Inspect** to activate selection mode (or press `Alt+O`)
3. Hover over web elements to see a blue highlight border
4. Click a target element and enter your modification in the popup input
5. Open the **Side Panel** (`Alt+L`) to manage all annotations
6. Click **Copy Prompt** to export an AI-readable Markdown prompt

## 🛠 Architecture

| Component | Description |
|-----------|-------------|
| **Manifest** | Chrome Extension Manifest V3 |
| **Background** | Service Worker for extension state and shortcuts |
| **Content Script** | DOM listeners, element highlighting, annotation UI |
| **Popup** | Quick-action button interface |
| **Side Panel** | Annotation list management and prompt export |

```
agentation-chrom-extension/
├── manifest.json              # Extension configuration
├── src/
│   ├── background.js          # Service Worker
│   ├── content.js             # Content Script (core DOM interaction)
│   ├── styles.css             # Content Script injected styles
│   ├── ui.css                 # Shared UI component styles
│   ├── popup/                 # Popup interface
│   │   ├── popup.html
│   │   └── popup.js
│   └── sidepanel/             # Side Panel interface
│       ├── sidepanel.html
│       └── sidepanel.js
├── icons/                     # Extension icons
└── store_assets/              # Chrome Web Store publishing assets
```

## 📄 Export Format Example

```markdown
# Webpage Context
URL: https://example.com/dashboard
Viewport: 1920x1080

# Annotations

## Annotation 1
**Target**: `button.primary-btn`
**Feedback**: The button color is too light, please change it to dark blue (#0056b3).
**Current Styles**:
- background-color: #e0e0e0
- color: #333
**HTML**:
`<button class="primary-btn">Submit</button>`
```

## 🤝 Contributing

Contributions of all kinds are welcome! Please read [CONTRIBUTING_EN.md](CONTRIBUTING_EN.md) for details on how to contribute.

## 📜 License

This project is licensed under the [MIT License](LICENSE).
