# UISelector2AI

<p align="center">
  <img src="icons/icon128.png" alt="UISelector2AI Logo" width="128" height="128">
</p>

<p align="center">
  <strong>From webpage to AI prompt, in one click.</strong><br>
  Capture selectors, HTML, page context, and network requests, then turn them into a clean Markdown prompt for AI coding agents.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/manifest-v3-green.svg" alt="Manifest V3">
  <img src="https://img.shields.io/badge/chrome-extension-yellow.svg" alt="Chrome Extension">
</p>

<p align="center">
  <a href="README.md">中文</a>
</p>

---

## Features

- **Element selection**: hover to highlight any web element, click to select
- **Smart annotations**: add modification notes to selected UI elements
- **One-click export**: convert annotations and page context into a Markdown prompt
- **Side Panel management**: review, edit, and drag-sort all annotations in one place
- **Network capture**: capture API requests and include them in the exported prompt
- **Voice input**: dictate annotation text and page context with the microphone
- **Keyboard shortcuts**: `Alt+O` / `Alt+L` / `Alt+N` / `Alt+C` / `Alt+X`
- **Shortcut sound toggle**: enable or disable sound effects triggered by shortcuts

## Use Case

UISelector2AI is useful when you need to communicate UI changes to an AI coding agent.  
You can mark elements on a page, add clear instructions, capture network requests, and export everything as a Markdown prompt that Claude, Cursor, ChatGPT, and similar tools can read easily.

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/benxuhuang/UISelector2AI.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the project root folder `UISelector2AI`

## Quick Start

1. Click the UISelector2AI icon in the browser toolbar
2. Click **Start Inspect** or press `Alt+O` to enable inspect mode
3. Hover over elements to see the highlight box
4. Click a target element and enter your instruction
5. Open the **Side Panel** or press `Alt+L` to manage annotations
6. Use **Network Capture** or press `Alt+N` to capture requests
7. Click **Copy Prompt** to export a Markdown prompt
8. Click **Clear All Annotations** or press `Alt+X` to clear the current page annotations

## Settings Page

The settings page includes the following sections:

- **Speech-to-Text**
  - Provider: Groq / OpenAI / OpenRouter / Custom
  - API Key, Base URL, Model, and Language
- **LLM Refiner**
  - Optional enable/disable toggle
  - Provider, API Key, Base URL, Model, and System Prompt
- **Shortcut sound effects**
  - Toggle whether shortcut-triggered sound effects should play

The settings page also provides:

- **Test STT**
- **Test LLM**
- A **Save** button fixed at the bottom of the page

## Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+O` | Toggle Inspect Mode |
| `Alt+L` | Toggle Side Panel |
| `Alt+N` | Toggle Network Capture |
| `Alt+C` | Copy Prompt |
| `Alt+X` | Clear current page annotations |

## Project Structure

```text
UISelector2AI/
├── manifest.json
├── src/
│   ├── background.js
│   ├── content.js
│   ├── interceptor.js
│   ├── offscreen/
│   │   ├── offscreen.html
│   │   └── offscreen.js
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.js
│   ├── settings/
│   │   ├── settings.html
│   │   └── settings.js
│   └── sidepanel/
│       ├── sidepanel.html
│       └── sidepanel.js
├── assets/
├── icons/
└── README_EN.md
```

## Export Format Example

```markdown
# Webpage Context
URL: https://example.com/dashboard
Viewport: 1920x1080

# Annotations

## Annotation 1
**Target**: `button.primary-btn`
**Feedback**: Please change the button color to dark blue (#0056b3).
**Current Styles**:
- background-color: #e0e0e0
- color: #333
**HTML**:
`<button class="primary-btn">Submit</button>`
```

## Contributing

Contributions of all kinds are welcome.  
Please read [CONTRIBUTING_EN.md](CONTRIBUTING_EN.md) for details.

## License

This project is licensed under the [MIT License](LICENSE).
