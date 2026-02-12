# 行事曆共編系統

學校行事曆多人協作編輯系統。前端為獨立靜態網站，可部署至 GitHub Pages / Netlify；後端使用 Google Apps Script 作為薄 API 層，資料儲存於 Google Sheets。

## 架構

```
Frontend (靜態網站)          GAS REST API            Google Sheets (資料庫)
HTML/CSS/JS  ──fetch()──>  doPost()/doGet()  ──>  行事曆 / 使用者管理 / 系統設定
Google Sign-In                Token 驗證
FullCalendar                  權限檢查
```

## 功能

- Google Sign-In 登入，三級權限控管（管理員/編輯者/檢視者）
- 行事曆事件 CRUD（新增/編輯/刪除）
- 週次表格 + FullCalendar 月曆雙檢視
- 即時同步（8 秒輪詢，背景 30 秒）
- 批次匯入（CSV / XLS / XLSX / Google Sheet）
- 匯出 Excel / PDF / Word
- 同步至 Google Calendar
- 暗色科技風 UI
- 語音輸入

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
│   └── Code.gs             # GAS REST API 後端
├── package.json
└── .gitignore
```

## 部署步驟

### 1. Google Cloud Console 設定

1. 前往 [Google Cloud Console](https://console.cloud.google.com)
2. 建立新專案或選擇現有專案
3. 啟用 **Google Identity Services**
4. 前往 **API 和服務 → 憑證 → 建立憑證 → OAuth 2.0 用戶端 ID**
5. 選擇 **網頁應用程式**
6. 設定 **已授權的 JavaScript 來源**：
   - `http://localhost:3000`（本地測試）
   - `https://your-domain.com`（正式環境）
7. 複製 **Client ID**

### 2. Google Sheets 準備

使用現有的 Google Sheet，或建立新的。系統會自動建立 `使用者管理` 和 `系統設定` 工作表。

行事曆工作表欄位：

| 欄 | 標題 | 說明 |
|----|------|------|
| A | 開始日期 | YYYY-MM-DD |
| B | 結束日期 | YYYY-MM-DD |
| C | 活動內容 | 文字 |
| D | 備註 | 文字 |
| E | ID | 唯一識別碼 |
| F | 最後更新時間 | ISO 時間戳 |
| G | 建立者 | Gmail（自動新增） |
| H | 是否刪除 | TRUE/FALSE（自動新增） |

### 3. 部署 GAS REST API

1. 前往 [Google Apps Script](https://script.google.com)，建立新專案
2. 將 `gas/Code.gs` 的內容貼入
3. 修改最上方的 `CONFIG`：
   ```javascript
   const CONFIG = {
     SPREADSHEET_ID: '你的 Google Sheet ID',
     CALENDAR_ID: '你的 Google Calendar ID',
     ADMIN_EMAILS: ['admin@gmail.com'],
   };
   ```
4. 部署為 **網頁應用程式**：
   - 執行身分：**以我的身分執行**
   - 存取權限：**所有人**
5. 複製部署 URL

### 4. 設定前端

編輯 `assets/js/config.js`：

```javascript
const CONFIG = {
  API_URL: '你的 GAS Web App URL',
  GOOGLE_CLIENT_ID: '你的 Google OAuth Client ID',
  SPREADSHEET_ID: '你的 Google Sheet ID',
  // ...其他設定
};
```

### 5. 本地測試

```bash
npm start
# 或
npx serve .
```

開啟 `http://localhost:3000`

### 6. 部署到 GitHub Pages

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin git@github.com:your-user/your-repo.git
git push -u origin main
```

在 GitHub 倉庫的 Settings → Pages 中啟用 GitHub Pages（Branch: main）。

## 權限模型

| 能力 | 管理員 | 編輯者 | 檢視者 |
|------|--------|--------|--------|
| 查看活動 | O | O | O |
| 新增活動 | O | O | X |
| 編輯自己的活動 | O | O | X |
| 編輯所有活動 | O | X | X |
| 刪除自己的活動 | O | O | X |
| 刪除所有活動 | O | X | X |
| 批次匯入 | O | O | X |
| 匯出 | O | O | O |
| 管理使用者 | O | X | X |
| 系統設定 | O | X | X |
| 同步到 Google Calendar | O | X | X |

## 外部函式庫（CDN）

| 函式庫 | 用途 |
|--------|------|
| FullCalendar 6.x | 月曆顯示 |
| Google Identity Services | Google 登入 |
| SheetJS (xlsx) | Excel 解析/匯出 |
| PapaParse | CSV 解析 |
| docx.js | Word 匯出 |
