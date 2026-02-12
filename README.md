# 行事曆共編系統

學校行事曆多人協作編輯系統。前端為獨立靜態網站，部署於 GitHub Pages；後端使用 Google Apps Script 作為 REST API 層，資料儲存於 Google Sheets。

## 架構

```
┌─────────────────────────────────┐
│  Frontend (GitHub Pages)         │
│  純 HTML/CSS/JS 靜態網站         │
│  - Google Sign-In 登入           │
│  - FullCalendar 月曆             │
│  - 週次表格                      │
│  - 匯入/匯出功能                 │
└──────────┬──────────────────────┘
           │ fetch() POST/GET
           ▼
┌─────────────────────────────────┐
│  GAS REST API (薄 API 層)        │
│  部署為 Web App                  │
│  - doPost() 統一入口             │
│  - Token 驗證 + 權限檢查         │
│  - Google Sheets 讀寫            │
│  - Google Calendar 同步          │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Google Sheets (資料庫)           │
│  行事曆 / 使用者管理 / 系統設定    │
└─────────────────────────────────┘
```

## 功能

- **Google Sign-In 登入**，三級權限控管（管理員 / 編輯者 / 檢視者）
- **行事曆事件 CRUD** — 支援全天或指定時間區間
- **週次表格 + FullCalendar 月曆**雙檢視
- **即時同步** — 8 秒輪詢前景、30 秒背景，多人共編自動更新
- **批次匯入** — CSV / XLS / XLSX / Google Sheet
- **匯出** — Excel / PDF / Word（含空白週次、優化間距）
- **Google Calendar 智慧同步** — 透過事件 ID 比對，支援新增、更新、刪除
- **暗色科技風 UI**
- **語音輸入**
- **GitHub Actions 自動部署** — 前端 + GAS 後端一鍵 CI/CD

## 專案結構

```
gas-calendar-app/
├── index.html              # 單一入口頁面
├── assets/
│   ├── css/
│   │   └── style.css       # 暗色科技風主題
│   └── js/
│       ├── config.js       # API URL、Client ID 等設定
│       ├── auth.js         # Google Sign-In 認證
│       ├── api.js          # API 客戶端（fetch → GAS）
│       ├── store.js        # EventStore 狀態管理
│       ├── sync.js         # SyncManager 即時輪詢
│       ├── ui.js           # UI 元件（toast、modal、loading）
│       ├── form.js         # 新增/編輯活動表單
│       ├── table.js        # 週次表格渲染
│       ├── calendar.js     # FullCalendar + App 主控制器
│       ├── import.js       # 批次匯入模組
│       ├── export.js       # 匯出模組
│       └── admin.js        # 管理面板
├── gas/
│   ├── Code.gs             # GAS REST API 後端
│   └── appsscript.json     # GAS 設定檔
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Actions CI/CD
├── .clasp.json             # clasp 設定
├── package.json
├── CHANGELOG.md            # 開發日誌
└── .gitignore
```

## Google Sheet 資料結構

### 行事曆工作表

| 欄 | 標題 | 說明 |
|----|------|------|
| A | 開始日期 | YYYY-MM-DD |
| B | 結束日期 | YYYY-MM-DD |
| C | 活動內容 | 文字 |
| D | 備註 | 文字 |
| E | ID | 唯一識別碼 |
| F | 最後更新時間 | ISO 時間戳 |
| G | 建立者 | Gmail（自動填入） |
| H | 是否刪除 | TRUE/FALSE（軟刪除） |
| I | 日曆事件ID | Google Calendar Event ID |
| J | 開始時間 | HH:MM（空值 = 全天） |
| K | 結束時間 | HH:MM（空值 = 全天） |

### 使用者管理工作表

| 欄 | 標題 | 說明 |
|----|------|------|
| A | Email | Gmail 帳號 |
| B | 角色 | admin / editor / viewer |
| C | 姓名 | 顯示名稱 |
| D | 啟用 | TRUE / FALSE |

### 系統設定工作表

| Key | 說明 |
|-----|------|
| semesterStart | 學期開始日期 |
| semesterEnd | 學期結束日期 |
| calendarTitle | 行事曆標題 |
| googleCalendarId | Google Calendar ID |
| lastModified | 最後修改時間（自動更新） |

## 部署方式

### 自動部署（推薦）

推送到 `main` 分支後，GitHub Actions 自動執行：
- **前端** → 部署至 GitHub Pages
- **GAS 後端** → 透過 clasp 推送並更新現有部署

需設定的 GitHub Secrets：

| Secret | 說明 |
|--------|------|
| `GAS_WEB_APP_URL` | GAS Web App 部署 URL |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GAS_SCRIPT_ID` | Google Apps Script 專案 ID |
| `GAS_DEPLOYMENT_ID` | GAS 部署 ID（固定，避免每次建新 URL） |
| `CLASP_CREDENTIALS` | clasp 認證 JSON（~/.clasprc.json 內容） |

### 首次設定

1. **Google Cloud Console** — 建立 OAuth 2.0 Client ID，設定已授權的 JavaScript 來源
2. **Google Sheet** — 建立新的 Sheet，系統會自動建立所需工作表
3. **GAS** — 使用 `clasp create` 建立專案，`clasp push` 推送程式碼，手動執行 `manualInit` 授權
4. **GitHub** — 設定 Secrets，啟用 GitHub Pages

## 權限模型

| 能力 | 管理員 | 編輯者 | 檢視者 |
|------|--------|--------|--------|
| 查看活動 | O | O | O |
| 新增 / 編輯自己的活動 | O | O | X |
| 編輯 / 刪除所有活動 | O | X | X |
| 批次匯入 | O | O | X |
| 匯出 Excel / PDF / Word | O | O | O |
| 管理使用者 | O | X | X |
| 系統設定 | O | X | X |
| 同步 Google Calendar | O | X | X |

## 即時同步機制

```
SyncManager 每 8 秒呼叫 checkForUpdates(lastTimestamp)
  → GAS 讀取系統設定的 lastModified（單一 cell，極快）
  → 若時間戳不同 → 回傳全部事件 + 新 timestamp
  → 若相同 → 回傳 { hasChanges: false }
  → 前端更新 EventStore → 重新渲染表格 + 月曆
```

- 前景：每 8 秒
- 背景：每 30 秒
- 寫入操作後：立即觸發一次同步

## Google Calendar 同步

透過 Sheet I 欄儲存的 Calendar Event ID 進行智慧同步：

| 情境 | 行為 |
|------|------|
| 新活動（無 ID） | 建立日曆事件，ID 寫回 Sheet |
| 修改活動（有 ID） | 更新原日曆事件（標題、日期、時間） |
| 刪除活動（有 ID） | 從日曆移除事件 |
| 指定時間活動 | 建立有時間的事件（非全天） |

## 外部函式庫（CDN）

| 函式庫 | 用途 |
|--------|------|
| FullCalendar 6.x | 月曆顯示 |
| Google Identity Services | Google 登入 |
| SheetJS (xlsx) | Excel 解析/匯出 |
| PapaParse | CSV 解析 |
| docx.js | Word 匯出 |
