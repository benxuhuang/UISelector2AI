# 貢獻指南 (Contributing Guide)

感謝你對 **UISelector2AI** 的關注！我們非常歡迎來自社群的貢獻。無論是回報問題、建議新功能還是提交程式碼，你的參與都對這個專案意義重大。

## 🚀 如何開始

### 1. Fork & Clone

```bash
# Fork 此 Repository 到你的 GitHub 帳號
# 然後 Clone 到本地
git clone https://github.com/<your-username>/UISelector2AI.git
cd UISelector2AI
```

### 2. 安裝與載入擴充功能

1. 開啟 Chrome 瀏覽器，前往 `chrome://extensions/`
2. 開啟右上角的「**開發人員模式**」
3. 點擊「**載入未封裝擴充功能**」
4. 選取專案根目錄

### 3. 建立分支

```bash
git checkout -b feature/your-feature-name
```

## 📋 貢獻流程

### 回報問題 (Bug Report)

1. 前往 [Issues](../../issues) 頁面
2. 點擊 **New Issue**
3. 請包含以下資訊：
   - **問題描述**：清楚描述你遇到的問題
   - **重現步驟**：如何重現此問題
   - **預期行為**：你期望的正確行為
   - **環境資訊**：Chrome 版本、作業系統

### 建議功能 (Feature Request)

1. 前往 [Issues](../../issues) 頁面
2. 描述你希望新增的功能以及使用場景

### 提交程式碼 (Pull Request)

1. 確保你的程式碼遵循專案的現有風格
2. 在修改程式碼後，於 Chrome 中重新載入擴充功能並測試
3. 撰寫清楚的 Commit 訊息
4. 提交 Pull Request 並描述你的修改內容

## 🧑‍💻 開發規範

### 程式碼風格

- 使用 **2 個空格**進行縮排
- 使用 `const` / `let`，避免 `var`
- 函式與變數命名使用 **camelCase**
- 程式碼註解以**繁體中文**或**英文**撰寫

### Commit 訊息格式

```
<類型>: <簡短描述>

<詳細說明（可選）>
```

**類型範例**：
- `feat`: 新功能
- `fix`: 修正問題
- `docs`: 文件更新
- `style`: 樣式調整（不影響功能）
- `refactor`: 重構程式碼

### 專案結構

```
agentation-chrom-extension/
├── manifest.json          # Chrome 擴充功能設定
├── src/
│   ├── background.js      # Service Worker
│   ├── content.js         # Content Script（DOM 互動）
│   ├── styles.css         # Content Script 樣式
│   ├── ui.css             # UI 元件樣式
│   ├── popup/             # Popup 介面
│   └── sidepanel/         # Side Panel 介面
├── icons/                 # 擴充功能圖示
└── store_assets/          # Chrome Web Store 相關資源
```

## 📜 授權

提交至此專案的所有貢獻，將遵循 [MIT License](LICENSE) 授權。

## 💬 有問題嗎？

如果你有任何疑問，歡迎在 [Issues](../../issues) 中發問，我們會盡快回覆！
