# 開發日誌

行事曆共編系統的開發歷程、需求演進與問題修正紀錄。

---

## 2026-02-12 — 專案啟動：完整重構

### 背景

原有系統完全綁定在 Google Apps Script 內（CSS/JS 嵌在 HTML 中），無法使用 Git 管理、無法部署到 GitHub Pages，且功能較陽春（60 秒輪詢、無權限控管、亮色主題）。

### 需求

1. 脫離 GAS 綁定，前端獨立為純 HTML/CSS/JS 靜態網站
2. Google Sheet 作為資料來源（保留現有資料）
3. 即時共編（5-8 秒輪詢偵測變更）
4. 權限管理（管理員/編輯者/檢視者）
5. 批次匯入（CSV/XLS/Google Sheet）
6. 暗色科技風主題

### 架構決策

- **前端完全獨立**：純靜態檔案，用 `fetch()` 呼叫 GAS API，取代 `google.script.run`
- **GAS 為薄 API 層**：只負責讀寫 Google Sheet/Calendar，可隨時替換
- **Google Sign-In**：使用 Google Identity Services 取得 ID Token，GAS 透過 tokeninfo 端點驗證
- **GAS 部署設定**：「以我的身份執行」+「任何人都能存取」
- **`Content-Type: text/plain`**：避免 CORS preflight 問題
- **軟刪除模式**：H 欄標記 `isDeleted`，不實際刪除資料列

### 實作內容

- `gas/Code.gs`：完整 REST API 後端（約 1400 行）
- `assets/css/style.css`：暗色科技風主題（約 1500 行）
- `index.html`：單一入口頁面，含所有 UI 區塊和 Modal
- `assets/js/` 下 11 個模組：config、auth、api、store、sync、ui、form、table、calendar、import、export、admin

### 整合修正

初次整合時發現多個前後端不一致問題，逐一修正：

| 問題 | 原因 | 修正方式 |
|------|------|---------|
| API 回應格式不符 | GAS 包在 `{ success, data: {...} }`，前端期待扁平結構 | `api.js` 加入自動展平邏輯 |
| 欄位名稱不一致 | GAS 用 `title/note`，前端用 `content/notes` | 統一為 `content/notes` |
| 輪詢欄位不符 | `hasUpdates` vs `hasChanges`、`lastModified` vs `timestamp` | GAS 改為前端命名 |
| `handleImportFromSheet` 不存在 | 前端呼叫但 GAS 沒實作 | 補上實作 |
| `user.active` vs `user.enabled` | admin 面板讀錯欄位 | 統一為 `enabled` |
| Auth 檢查不完整 | 只檢查 `result.success` 未檢查 `isAuthorized` | 加入 `isAuthorized` 檢查 |

### CI/CD 部署

- 使用 **clasp** 從命令列部署 GAS（取代手動貼上程式碼）
- 建立 **GitHub Actions** workflow：
  - Job 1：前端部署到 GitHub Pages（`sed` 注入 secrets 到 config.js）
  - Job 2：GAS 部署（`clasp push --force` + `clasp deploy`）
- 設定 Google Cloud Console OAuth 2.0 Client ID

### 部署過程遇到的問題

| 問題 | 原因 | 解法 |
|------|------|------|
| `npm install -g clasp` EACCES | node 目錄權限不足 | 改用 `npm install --save-dev` + `npx clasp` |
| `clasp create --type webapp` 失敗 | Invalid container file type | 改用 `--type standalone` |
| GAS「存取遭拒」| 新專案未授權 | 手動開啟 GAS 編輯器執行 `manualInit` 授權 |
| 「找不到行事曆工作表」| 新 Sheet 沒有「行事曆」分頁 | `ensureSheetsInitialized()` 加入自動建立 |
| 管理按鈕不顯示 | `style="display:none"` 覆蓋 class | `applyRoleVisibility` 同時清除 inline style |
| Actions clasp 認證失敗 | `echo` 截斷 JSON 特殊字元 | 改用 `env` + `printenv` 寫入 |
| GitHub Pages 部署失敗 | Pages 未啟用 | 用 `gh api` 啟用後重新觸發 |

---

## 2026-02-13 — 匯出優化與批次匯入

### 需求

- 匯出行事曆時，空白的週次也要列出（不要跳過沒有活動的週）
- 表格間距太擠，行與行之間需要更多空間
- 缺少批次匯入按鈕

### 修正

- **`export.js` getTableData()**：移除 `if (weekEvents.length > 0)` 判斷，改為所有週次都輸出
- **PDF 間距**：`padding: 5px` → `8px 10px`、`line-height: 1.4` → `1.8`
- **Excel 間距**：加入 `ws['!rows']` 動態行高，依內容行數計算（每行 20pt，最少 25pt）
- **Word 間距**：TableCell 加入 `margins: { top: 60, bottom: 60, left: 120, right: 120 }`，段落 `spacing: { before: 20, after: 120 }`
- **index.html**：操作按鈕列補上「批次匯入」按鈕（`editor-only`）

---

## 2026-02-13 — Google Calendar 智慧同步

### 需求

原本同步到 Google Calendar 是用「標題 + 日期」比對是否重複。如果修改了活動標題再同步，會建立重複事件（舊標題和新標題並存）。希望改用 ID 比對，支援更新和刪除。

### 修正

- Sheet 新增 **I 欄（日曆事件 ID）**
- `handleSyncToCalendar()` 重寫同步邏輯：
  - 有 Calendar ID → 找到原事件，更新標題/日期/備註
  - 沒有 Calendar ID → 建立新事件，ID 寫回 Sheet
  - 已刪除且有 ID → 從日曆移除事件
  - 日曆事件被手動刪除 → 偵測不到舊事件，自動重新建立
- 同步結果訊息改為分類顯示：「新增 X 筆，更新 X 筆，刪除 X 筆」

---

## 2026-02-13 — 活動時間設定功能

### 需求

希望新增/編輯活動時，可以選擇「全天」或「指定時間」（幾點到幾點），預設為全天。同步到 Google Calendar 時也能建立有時間的事件。

### 修正

- **index.html**：表單和編輯 Modal 加入下拉選單（全天/指定時間）+ 時間輸入框
- **form.js**：`toggleTimeInputs()` 切換顯示、`save()`/`saveFromModal()` 收集 startTime/endTime
- **store.js**：`formatActivityDate()` 支援顯示時間段 `08:00-12:00`
- **table.js**：活動文字加入時間顯示
- **calendar.js**：有時間 → `allDay: false` + `start: "YYYY-MM-DDTHH:MM"`
- **export.js**：匯出內容包含時間資訊
- **Code.gs**：Sheet 新增 J（開始時間）、K（結束時間）欄位，Calendar 同步支援 `createEvent()` 建立有時間的事件

---

## 2026-02-13 — 移除舊架構遺留 UI

### 需求

「從 Google Sheets 載入」和「上傳至 Google Sheets」按鈕是否還有必要？目前系統已經自動同步。

### 分析

- 登入後自動載入所有活動
- 每 8 秒輪詢偵測變更，自動更新
- 所有 CRUD 操作直接透過 API 寫入 Sheet
- `syncToSheets()` 已是空殼函式（只顯示 toast）
- 「重要操作提醒」內容已不適用新架構

### 修正

- 移除「從 Google Sheets 載入」按鈕
- 移除「上傳至 Google Sheets」按鈕
- 移除「重要操作提醒」區塊
- 移除空殼 `syncToSheets()` 函式
- 「新增 Google 行事曆」按鈕改名為「同步 Google 行事曆」

---

## 2026-02-13 — 修正時間欄位顯示為完整時間戳

### 問題

設定指定時間（如 08:00-09:00）後，表格顯示為 `Sat Dec 30 1899 16:00:00 GMT+0800 (台北標準時間)` 而非 `08:00`。

### 原因

Google Sheets 將時間值（如 `08:00`）內部儲存為 **Date 物件**（以 1899-12-30 為基準日期）。GAS 用 `getValues()` 讀取時拿到的是 Date 物件，直接 `String()` 轉換會輸出完整時間戳。

### 修正

新增 `formatTime()` 工具函式：
- 偵測到 Date 物件 → 用 `getHours()` + `getMinutes()` 提取 `HH:MM`
- 偵測到字串 → 用正則匹配 `HH:MM` 格式
- 空值 → 回傳空字串

影響位置：`handleGetEvents`、`handleCheckForUpdates`、`handleSyncToCalendar` 共 3 處讀取時間的邏輯。

---

## 2026-02-13 — 修正 GAS 部署版本問題

### 問題

新增的「指定時間」功能無效，事件仍然顯示為全天。

### 原因

GitHub Actions 每次 `clasp deploy` 建立**新的部署 URL**，但 `config.js` 的 API URL 指向版本 @3（舊的）。GAS 部署是版本快照，推送新程式碼不會更新已存在的部署 URL。

前端一直呼叫舊版 API，所以 `startTime`/`endTime` 欄位被舊版 GAS 忽略。

### 修正

1. 手動更新現有部署到最新版本：`clasp deploy -i <部署ID>`
2. GitHub Actions 改用 `clasp deploy -i ${{ secrets.GAS_DEPLOYMENT_ID }}` 更新同一個部署
3. 新增 `GAS_DEPLOYMENT_ID` GitHub Secret
4. 不再每次建立新的部署 URL，確保 config.js 的 API URL 永遠有效

---

## 2026-02-13 — 修正時間欄位時區偏移

### 問題

設定時間為早上 08:00-09:00，Google Sheet 資料正確，但前端顯示為 16:00-17:00（差 8 小時）。

### 原因

`formatTime()` 使用 `getHours()` / `getMinutes()`，這會套用 GAS 伺服器的時區（UTC+8 台北）。Google Sheets 內部以 UTC 儲存時間值，因此 `getHours()` 會加上 8 小時偏移。

### 修正

改用 `getUTCHours()` / `getUTCMinutes()` 取得原始 UTC 時間值，對應使用者在 Sheet 中輸入的時間。

---

## 2026-02-13 — 修正時間顯示異常 + 備註關聯活動

### 問題 1：編輯後時間偶爾顯示完整時間戳

編輯活動後，表格偶爾顯示 `Sat Dec 30 1899 16:00:00...`，重新整理後恢復正常。

### 原因

`formatActivityDate()` 接收到尚未經過 Server 格式化的原始時間值，直接串入顯示字串。

### 修正

在 `store.js` 的 `formatActivityDate()` 加入正則驗證：`validTime = (t) => t && /^\d{1,2}:\d{2}$/.test(t)`，只接受 `HH:MM` 格式，其他值一律忽略（顯示為全天）。

### 問題 2：備註無法辨識對應活動

同一週有多個活動各有備註時，備註欄只列出備註文字，看不出屬於哪個活動。

### 修正

- **`table.js`**：備註收集時保留活動名稱 `label: event.content`，渲染時加上前綴標籤 `活動名稱：備註內容`
- **`export.js`**：匯出的備註也加上活動名稱前綴
- **`style.css`**：新增 `.note-label` 樣式，較淡顏色 + 粗體

---

## 2026-02-13 — 修正 Toast 通知不會自動消失

### 問題

Toast 彈跳通知不會自動消失，持續堆疊在畫面上。

### 原因

`ui.js` 使用 `classList.remove('show')` + `transitionend` 事件來移除 Toast 元素。但 `style.css` 中 Toast 的出場/退場效果是用 CSS `animation`（`@keyframes toastSlideIn / toastSlideOut`），而非 CSS `transition`。因此 `transitionend` 事件永遠不會觸發，Toast 元素不會被移除。

### 修正

改用 `classList.add('toast-dismiss')` + `animationend` 事件，與 CSS 的 `.toast-dismiss` animation 動畫搭配。Toast 動畫結束後正確觸發 `animationend`，元素被移除。
