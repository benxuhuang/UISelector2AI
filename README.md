# UISelector2AI

<p align="center">
  <img src="icons/icon128.png" alt="UISelector2AI Logo" width="128" height="128">
</p>

<p align="center">
  <strong>從網頁畫面到 AI 指令，一鍵完成。</strong><br>
  提取 CSS 選擇器與 HTML，轉換為 AI-ready 的修改指令。
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/manifest-v3-green.svg" alt="Manifest V3">
  <img src="https://img.shields.io/badge/chrome-extension-yellow.svg" alt="Chrome Extension">
</p>

<p align="center">
  繁體中文 ·
  <a href="README_EN.md">English</a>
</p>

---

## ✨ 功能特色

- 🎯 **元素選取** — 懸停高亮任意網頁元素，點擊即可選取
- 📝 **智慧註解** — 為選取的元素添加修改建議或備註
- 📋 **一鍵匯出** — 將註解與上下文資訊轉換為 Markdown 格式 AI Prompt
- 🗂️ **Side Panel 管理** — 集中查看、管理所有已標記的註解
- ⌨️ **快捷鍵支援** — 透過 Alt+O / Alt+L / Alt+X 快速操作

## 🎬 使用情境

使用 UISelector2AI，你可以快速在任何網頁上標記需要修改的 UI 元素，添加具體的修改說明，然後一鍵將所有資訊導出為 AI 友好的 Prompt。這大幅簡化了與 AI Coding Agent（如 Claude、Cursor、ChatGPT）之間的溝通。

## 📦 安裝方式

### 從原始碼安裝（開發者模式）

1. Clone 此 Repository：
   ```bash
   git clone https://github.com/benxuhuang/UISelector2AI.git
   ```
2. 開啟 Chrome 瀏覽器，前往 `chrome://extensions/`
3. 開啟右上角的「**開發人員模式**」
4. 點擊「**載入未封裝擴充功能**」
5. 選取 Clone 下來的專案根目錄

## 🚀 快速開始

1. 點擊瀏覽器工具列中的 UISelector2AI 圖示
2. 點擊 **Start Inspect** 啟動選取模式（或按 `Alt+O`）
3. 滑鼠移至網頁元素上方，將看到藍色高亮邊框
4. 點擊目標元素，在彈出輸入框中輸入修改建議
5. 開啟 **Side Panel**（`Alt+L`）管理所有註解
6. 點擊 **Copy Prompt** 一鍵匯出 AI 可讀的 Markdown

## 🛠 技術架構

| 元件 | 說明 |
|------|------|
| **Manifest** | Chrome Extension Manifest V3 |
| **Background** | Service Worker，管理擴充功能狀態與快捷鍵 |
| **Content Script** | DOM 監聽、元素高亮、註解輸入框 UI |
| **Popup** | 功能快捷按鈕介面 |
| **Side Panel** | 註解列表管理與 Prompt 匯出 |

```
agentation-chrom-extension/
├── manifest.json              # 擴充功能設定
├── src/
│   ├── background.js          # Service Worker
│   ├── content.js             # Content Script（DOM 互動核心）
│   ├── styles.css             # Content Script 注入樣式
│   ├── ui.css                 # UI 元件共用樣式
│   ├── popup/                 # Popup 介面
│   │   ├── popup.html
│   │   └── popup.js
│   └── sidepanel/             # Side Panel 介面
│       ├── sidepanel.html
│       └── sidepanel.js
├── icons/                     # 擴充功能圖示
└── store_assets/              # Chrome Web Store 發布資源
```

## 📄 匯出格式範例

```markdown
# Webpage Context
URL: https://example.com/dashboard
Viewport: 1920x1080

# Annotations

## Annotation 1
**Target**: `button.primary-btn`
**Feedback**: 這裡的按鈕顏色太淡了，請改成深藍色 (#0056b3)。
**Current Styles**:
- background-color: #e0e0e0
- color: #333
**HTML**:
`<button class="primary-btn">Submit</button>`
```

## 🤝 貢獻

歡迎任何形式的貢獻！請閱讀 [CONTRIBUTING.md](CONTRIBUTING.md) 了解詳細的貢獻流程。

## 📜 授權

本專案採用 [MIT License](LICENSE) 授權。
