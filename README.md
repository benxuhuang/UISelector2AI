# UISelector2AI

<p align="center">
  <img src="icons/icon128.png" alt="UISelector2AI Logo" width="128" height="128">
</p>

<p align="center">
  <strong>從網頁到 AI Prompt，一鍵完成。</strong><br>
  擷取 CSS selector、HTML、Context 與 Network Request，整理成適合 AI Coding Agent 使用的 Markdown Prompt。
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/manifest-v3-green.svg" alt="Manifest V3">
  <img src="https://img.shields.io/badge/chrome-extension-yellow.svg" alt="Chrome Extension">
</p>

<p align="center">
  <a href="README_EN.md">English</a>
</p>

---

## 功能

- **元素選取**：滑過元素會顯示高亮框，點擊即可建立註解
- **快速註解**：為選取的 UI 元素新增修改說明
- **一鍵匯出**：將註解與頁面 Context 轉成 Markdown Prompt
- **Side Panel 管理**：集中檢視、拖曳排序與編輯所有註解
- **Network Capture**：擷取網路請求並一起加入 Prompt
- **語音輸入**：在註解視窗與 Context 區使用麥克風輸入
- **快捷鍵操作**：支援 `Alt+O` / `Alt+L` / `Alt+N` / `Alt+C` / `Alt+X`
- **快捷鍵音效開關**：可在設定頁控制快捷鍵觸發的音效是否播放

## 適用情境

UISelector2AI 適合在需要和 AI Coding Agent 溝通 UI 修改需求時使用。  
你可以直接在頁面上標記元素、補充修改說明、擷取網路請求，最後輸出成適合 Claude、Cursor、ChatGPT 等工具閱讀的 Prompt。

## 安裝

### 以原始碼安裝

1. 下載或 clone 這個 repository
   ```bash
   git clone https://github.com/benxuhuang/UISelector2AI.git
   ```
2. 開啟 Chrome，進入 `chrome://extensions/`
3. 開啟右上角 **Developer mode**
4. 點選 **Load unpacked**
5. 選擇專案根目錄 `UISelector2AI`

## 快速開始

1. 點選瀏覽器工具列上的 UISelector2AI 圖示
2. 按 **Start Inspect** 或使用 `Alt+O` 開啟選取模式
3. 將滑鼠移到目標元素上，確認高亮框出現
4. 點擊元素後輸入修改說明並儲存
5. 需要整體管理時，開啟 **Side Panel** 或使用 `Alt+L`
6. 若要擷取 API 請求，按 **Network Capture** 或使用 `Alt+N`
7. 按 **Copy Prompt** 將目前內容匯出成 Markdown Prompt
8. 按 **Clear All Annotations** 或使用 `Alt+X` 清空目前頁面的註解

## 設定頁

從 Popup 或 Side Panel 的設定入口可以開啟設定頁。  
目前可設定的項目包含：

- **Speech-to-Text**
  - Provider：Groq / OpenAI / OpenRouter / Custom
  - API Key、Base URL、Model、Language
- **LLM Refiner**
  - 可選擇是否啟用
  - Provider、API Key、Base URL、Model、System Prompt
- **快捷鍵音效**
  - 可開啟或關閉快捷鍵觸發的音效

設定頁也提供：

- **Test STT**
- **Test LLM**
- 底部的 **Save** 按鈕

## 快捷鍵

| 快捷鍵 | 功能 |
|--------|------|
| `Alt+O` | 切換 Inspect Mode |
| `Alt+L` | 開關 Side Panel |
| `Alt+N` | 開關 Network Capture |
| `Alt+C` | 複製 Prompt |
| `Alt+X` | 清除目前頁面的註解 |

## 專案結構

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
└── README.md
```

## 匯出格式範例

```markdown
# Webpage Context
URL: https://example.com/dashboard
Viewport: 1920x1080

# Annotations

## Annotation 1
**Target**: `button.primary-btn`
**Feedback**: 請把按鈕顏色改成深藍色 (#0056b3)。
**Current Styles**:
- background-color: #e0e0e0
- color: #333
**HTML**:
`<button class="primary-btn">Submit</button>`
```

## 貢獻

歡迎各種形式的貢獻。  
如需參與開發，請參考 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 授權

本專案採用 [MIT License](LICENSE)。
