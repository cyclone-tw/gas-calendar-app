/**
 * ============================================================
 *  行事曆共編系統 - Google Apps Script REST API 後端
 *  適用於：學校行事曆多人協作編輯
 *  部署方式：以網路應用程式部署，「以我的身分執行」+「任何人皆可存取」
 * ============================================================
 */

// ===================== 系統設定 =====================

const CONFIG = {
  SPREADSHEET_ID: '16syUGJF3he9TmkATzDzw0yF8Wq93ctVnHtwJQUeKN5c',
  SHEET_NAME: '行事曆',
  USERS_SHEET_NAME: '使用者管理',
  SETTINGS_SHEET_NAME: '系統設定',
  CALENDAR_ID: 'ksps1@ksps.ntct.edu.tw',
  ADMIN_EMAILS: ['ksps1@ksps.ntct.edu.tw', 'cyclonetw@gmail.com'],
};

// 角色權限等級（數字越大權限越高）
const ROLE_LEVELS = {
  viewer: 1,
  editor: 2,
  admin: 3,
};

// 系統設定預設值
const DEFAULT_SETTINGS = {
  semesterStart: '',
  semesterEnd: '',
  calendarTitle: '學校行事曆',
  googleCalendarId: CONFIG.CALENDAR_ID,
  lastModified: new Date().toISOString(),
  pollingInterval: '8000',
};

// ===================== 入口點 =====================

/**
 * 處理 POST 請求（主要 API 入口）
 * 前端透過 fetch() 發送 JSON 請求至此
 */
function doPost(e) {
  try {
    // 解析請求內容
    const request = JSON.parse(e.postData.contents);
    const { action, token } = request;

    // testConnection 不需要驗證 token（用於初始連線測試）
    if (action === 'testConnection') {
      return handleTestConnection();
    }

    // auth 動作：驗證 token 並回傳使用者資訊
    if (action === 'auth') {
      return handleAuth(token);
    }

    // 其他所有動作都需要驗證 token
    const user = verifyToken(token);
    if (!user) {
      return jsonResponse({ success: false, error: '驗證失敗，請重新登入' });
    }

    const role = getUserRole(user.email);
    if (!role) {
      return jsonResponse({ success: false, error: '您沒有使用權限，請聯絡管理員' });
    }

    // 確保輔助工作表已初始化
    ensureSheetsInitialized();

    // 根據 action 路由到對應的處理函式
    switch (action) {
      case 'getEvents':
        return handleGetEvents(user, role);
      case 'checkForUpdates':
        return handleCheckForUpdates(request, user, role);
      case 'createEvent':
        return handleCreateEvent(request, user, role);
      case 'updateEvent':
        return handleUpdateEvent(request, user, role);
      case 'deleteEvent':
        return handleDeleteEvent(request, user, role);
      case 'batchImport':
        return handleBatchImport(request, user, role);
      case 'getSettings':
        return handleGetSettings(user, role);
      case 'updateSettings':
        return handleUpdateSettings(request, user, role);
      case 'getUsers':
        return handleGetUsers(user, role);
      case 'addUser':
        return handleAddUser(request, user, role);
      case 'removeUser':
        return handleRemoveUser(request, user, role);
      case 'updateUser':
        return handleUpdateUser(request, user, role);
      case 'syncToCalendar':
        return handleSyncToCalendar(user, role);
      case 'importFromSheet':
        return handleImportFromSheet(request, user, role);
      default:
        return jsonResponse({ success: false, error: '未知的動作：' + action });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: '伺服器錯誤：' + err.message });
  }
}

/**
 * 處理 GET 請求（用於輕量輪詢）
 * 前端每隔數秒呼叫一次以檢查是否有更新
 */
function doGet(e) {
  try {
    const params = e.parameter || {};
    const action = params.action;

    if (action === 'checkForUpdates') {
      const token = params.token;
      const lastTimestamp = params.lastTimestamp;

      if (!token) {
        return jsonResponse({ success: false, error: '缺少驗證 token' });
      }

      const user = verifyToken(token);
      if (!user) {
        return jsonResponse({ success: false, error: '驗證失敗' });
      }

      const role = getUserRole(user.email);
      if (!role) {
        return jsonResponse({ success: false, error: '沒有使用權限' });
      }

      return handleCheckForUpdates({ lastTimestamp: lastTimestamp }, user, role);
    }

    // 預設回應
    return jsonResponse({ success: true, message: '行事曆共編系統 API 運作中' });
  } catch (err) {
    return jsonResponse({ success: false, error: '伺服器錯誤：' + err.message });
  }
}

// ===================== 驗證與權限 =====================

/**
 * 驗證 Google ID Token
 * 透過 Google tokeninfo 端點驗證前端傳來的 token
 * @param {string} token - Google Sign-In ID token
 * @returns {{ email: string, name: string } | null}
 */
function verifyToken(token) {
  if (!token) return null;

  try {
    const response = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + token,
      { muteHttpExceptions: true }
    );

    if (response.getResponseCode() !== 200) {
      return null;
    }

    const info = JSON.parse(response.getContentText());

    // 確認 token 有效且包含必要欄位
    if (!info.email) return null;

    return {
      email: info.email.toLowerCase(),
      name: info.name || info.email.split('@')[0],
    };
  } catch (err) {
    Logger.log('Token 驗證失敗：' + err.message);
    return null;
  }
}

/**
 * 取得使用者角色
 * 優先檢查 ADMIN_EMAILS，再查 使用者管理 工作表
 * @param {string} email
 * @returns {'admin' | 'editor' | 'viewer' | null}
 */
function getUserRole(email) {
  if (!email) return null;

  const emailLower = email.toLowerCase();

  // 管理員清單中的 email 永遠是 admin
  if (CONFIG.ADMIN_EMAILS.map(e => e.toLowerCase()).includes(emailLower)) {
    return 'admin';
  }

  // 查詢使用者管理工作表
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.USERS_SHEET_NAME);

    if (!sheet) {
      // 工作表不存在，只有 ADMIN_EMAILS 中的人能用
      return null;
    }

    const data = sheet.getDataRange().getValues();
    // 從第 2 列開始（第 1 列是標題列）
    for (let i = 1; i < data.length; i++) {
      const rowEmail = String(data[i][0]).toLowerCase().trim();
      const rowRole = String(data[i][1]).toLowerCase().trim();
      const rowEnabled = data[i][3];

      if (rowEmail === emailLower) {
        // 檢查是否已啟用
        if (rowEnabled === false || String(rowEnabled).toUpperCase() === 'FALSE') {
          return null;
        }
        // 回傳角色，若角色無效則預設為 viewer
        if (ROLE_LEVELS[rowRole]) {
          return rowRole;
        }
        return 'viewer';
      }
    }
  } catch (err) {
    Logger.log('查詢使用者角色失敗：' + err.message);
  }

  return null;
}

/**
 * 檢查使用者是否具有最低要求的角色等級
 * @param {string} userRole - 使用者目前的角色
 * @param {string} minRole - 最低要求的角色
 * @returns {boolean}
 */
function requireRole(userRole, minRole) {
  if (!userRole || !minRole) return false;
  return (ROLE_LEVELS[userRole] || 0) >= (ROLE_LEVELS[minRole] || 0);
}

// ===================== 工作表管理 =====================

/**
 * 確保所有必要的工作表已建立
 * 在第一次 API 呼叫時自動初始化
 */
function ensureSheetsInitialized() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  // 確保行事曆工作表存在
  getOrCreateSheet(ss, CONFIG.SHEET_NAME, ['開始日期', '結束日期', '活動內容', '備註', 'ID', '最後更新時間', '建立者', '是否刪除', '日曆事件ID', '開始時間', '結束時間']);

  // 確保使用者管理工作表存在
  getOrCreateSheet(ss, CONFIG.USERS_SHEET_NAME, ['Email', '角色', '姓名', '啟用']);

  // 確保系統設定工作表存在並有預設值
  initSettingsSheet(ss);

  // 確保行事曆工作表有新增的欄位（向後相容）
  ensureCalendarSheetColumns(ss);
}

/**
 * 取得或建立工作表
 * @param {Spreadsheet} ss - 試算表物件
 * @param {string} name - 工作表名稱
 * @param {string[]} headers - 標題列
 * @returns {Sheet}
 */
function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      // 將標題列設為粗體
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      // 凍結標題列
      sheet.setFrozenRows(1);
    }
    Logger.log('已建立工作表：' + name);
  }

  return sheet;
}

/**
 * 初始化系統設定工作表
 * 若工作表不存在則建立，並填入預設的 key-value 設定
 */
function initSettingsSheet(ss) {
  const sheetName = CONFIG.SETTINGS_SHEET_NAME;
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, 2).setValues([['設定項目', '設定值']]);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
    sheet.setFrozenRows(1);

    // 寫入預設設定
    const entries = Object.entries(DEFAULT_SETTINGS);
    if (entries.length > 0) {
      sheet.getRange(2, 1, entries.length, 2).setValues(entries);
    }

    Logger.log('已建立系統設定工作表並寫入預設值');
  }

  return sheet;
}

/**
 * 確保行事曆工作表包含新增的 G、H、I 欄標題
 * 向後相容：不影響既有資料
 */
function ensureCalendarSheetColumns(ss) {
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return;

  const headers = sheet.getRange(1, 1, 1, 11).getValues()[0];

  // 檢查 G 欄（建立者）
  if (!headers[6] || String(headers[6]).trim() === '') {
    sheet.getRange(1, 7).setValue('建立者');
  }

  // 檢查 H 欄（是否刪除）
  if (!headers[7] || String(headers[7]).trim() === '') {
    sheet.getRange(1, 8).setValue('是否刪除');
  }

  // 檢查 I 欄（Google Calendar 事件 ID）
  if (!headers[8] || String(headers[8]).trim() === '') {
    sheet.getRange(1, 9).setValue('日曆事件ID');
  }

  // 檢查 J 欄（開始時間）
  if (!headers[9] || String(headers[9]).trim() === '') {
    sheet.getRange(1, 10).setValue('開始時間');
  }

  // 檢查 K 欄（結束時間）
  if (!headers[10] || String(headers[10]).trim() === '') {
    sheet.getRange(1, 11).setValue('結束時間');
  }
}

// ===================== 工具函式 =====================

/**
 * 產生唯一的事件 ID
 * 格式：時間戳記_隨機字串
 */
function generateEventId() {
  const timestamp = new Date().getTime();
  const random = Math.random().toString(36).substring(2, 11);
  return timestamp + '_' + random;
}

/**
 * 建立 JSON 格式的回應
 * @param {object} data - 回應資料
 * @returns {TextOutput}
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 在指定工作表中依 ID 尋找列號
 * @param {Sheet} sheet - 工作表
 * @param {string} id - 要尋找的 ID
 * @param {number} idColumn - ID 所在的欄位（1-based）
 * @returns {number} 列號（1-based），找不到回傳 -1
 */
function findRowById(sheet, id, idColumn) {
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idColumn - 1]).trim() === String(id).trim()) {
      return i + 1; // 回傳 1-based 列號
    }
  }

  return -1;
}

/**
 * 更新系統設定中的 lastModified 時間戳記
 * 每次資料變更後呼叫，讓輪詢機制能偵測到更新
 */
function updateLastModified() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET_NAME);
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === 'lastModified') {
        sheet.getRange(i + 1, 2).setValue(new Date().toISOString());
        return;
      }
    }

    // 若找不到 lastModified 設定，新增一筆
    sheet.appendRow(['lastModified', new Date().toISOString()]);
  } catch (err) {
    Logger.log('更新 lastModified 失敗：' + err.message);
  }
}

/**
 * 快速取得 lastModified 時間戳記
 * 輪詢用，盡量減少讀取量
 * @returns {string} ISO 時間戳記
 */
function getLastModified() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET_NAME);
    if (!sheet) return '';

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === 'lastModified') {
        return String(data[i][1]);
      }
    }
  } catch (err) {
    Logger.log('取得 lastModified 失敗：' + err.message);
  }
  return '';
}

/**
 * 格式化日期為 YYYY-MM-DD 字串
 * 相容 Date 物件與字串格式
 * @param {Date|string} date
 * @returns {string}
 */
function formatTime(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return padZero(val.getHours()) + ':' + padZero(val.getMinutes());
  }
  var s = String(val).trim();
  var match = s.match(/(\d{1,2}):(\d{2})/);
  if (match) return padZero(match[1]) + ':' + padZero(match[2]);
  return '';
}

function formatDate(date) {
  if (!date) return '';

  // 若已是字串格式
  if (typeof date === 'string') {
    // 嘗試匹配 YYYY-MM-DD
    const match = date.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
      return match[1] + '-' + padZero(match[2]) + '-' + padZero(match[3]);
    }
    // 嘗試解析其他日期字串
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return formatDateObject(parsed);
    }
    return String(date);
  }

  // Date 物件
  if (date instanceof Date && !isNaN(date.getTime())) {
    return formatDateObject(date);
  }

  return String(date);
}

/**
 * 將 Date 物件格式化為 YYYY-MM-DD
 */
function formatDateObject(d) {
  const year = d.getFullYear();
  const month = padZero(d.getMonth() + 1);
  const day = padZero(d.getDate());
  return year + '-' + month + '-' + day;
}

/**
 * 數字補零
 */
function padZero(num) {
  return String(num).length === 1 ? '0' + num : String(num);
}

// ===================== API 處理函式 =====================

/**
 * 處理 auth 動作 - 驗證使用者身分並回傳角色資訊
 */
function handleAuth(token) {
  try {
    const user = verifyToken(token);
    if (!user) {
      return jsonResponse({ success: false, error: '驗證失敗，Token 無效或已過期' });
    }

    // 確保輔助工作表已初始化
    ensureSheetsInitialized();

    const role = getUserRole(user.email);

    return jsonResponse({
      success: true,
      data: {
        email: user.email,
        name: user.name,
        role: role,
        isAuthorized: role !== null,
      },
    });
  } catch (err) {
    return jsonResponse({ success: false, error: '驗證過程發生錯誤：' + err.message });
  }
}

/**
 * 處理 testConnection 動作 - 測試試算表和日曆的連線狀態
 */
function handleTestConnection() {
  try {
    const results = { spreadsheet: false, calendar: false };

    // 測試試算表連線
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
      if (sheet) {
        results.spreadsheet = true;
      }
    } catch (e) {
      results.spreadsheetError = e.message;
    }

    // 測試日曆連線
    try {
      const cal = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
      if (cal) {
        results.calendar = true;
        results.calendarName = cal.getName();
      }
    } catch (e) {
      results.calendarError = e.message;
    }

    const message = (results.spreadsheet ? '試算表連線正常' : '試算表連線失敗') +
                     '；' +
                     (results.calendar ? '日曆連線正常' : '日曆連線失敗');

    return jsonResponse({
      success: true,
      data: { ...results, message: message },
    });
  } catch (err) {
    return jsonResponse({ success: false, error: '連線測試失敗：' + err.message });
  }
}

/**
 * 處理 getEvents 動作 - 取得所有未刪除的行事曆事件
 */
function handleGetEvents(user, role) {
  try {
    if (!requireRole(role, 'viewer')) {
      return jsonResponse({ success: false, error: '權限不足' });
    }

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ success: false, error: '找不到行事曆工作表' });
    }

    const data = sheet.getDataRange().getValues();
    const events = [];

    // 從第 2 列開始讀取（跳過標題列）
    for (let i = 1; i < data.length; i++) {
      const row = data[i];

      // 檢查是否已軟刪除（向後相容：H 欄可能不存在）
      const isDeleted = row.length > 7 && (row[7] === true || String(row[7]).toUpperCase() === 'TRUE');
      if (isDeleted) continue;

      // 跳過完全空白的列
      if (!row[0] && !row[2]) continue;

      events.push({
        startDate: formatDate(row[0]),
        endDate: formatDate(row[1]),
        content: String(row[2] || ''),
        notes: String(row[3] || ''),
        id: String(row[4] || ''),
        lastUpdated: row[5] ? String(row[5]) : '',
        createdBy: row.length > 6 ? String(row[6] || '') : '',
        startTime: row.length > 9 ? formatTime(row[9]) : '',
        endTime: row.length > 10 ? formatTime(row[10]) : '',
      });
    }

    return jsonResponse({
      success: true,
      data: {
        events: events,
        timestamp: getLastModified(),
        count: events.length,
      },
    });
  } catch (err) {
    return jsonResponse({ success: false, error: '取得事件失敗：' + err.message });
  }
}

/**
 * 處理 checkForUpdates 動作 - 輕量輪詢，比較時間戳記
 * 最佳化：僅讀取 lastModified 單一儲存格
 */
function handleCheckForUpdates(request, user, role) {
  try {
    if (!requireRole(role, 'viewer')) {
      return jsonResponse({ success: false, error: '權限不足' });
    }

    const clientTimestamp = request.lastTimestamp || '';
    const serverTimestamp = getLastModified();

    const hasUpdates = clientTimestamp !== serverTimestamp;

    const response = {
      success: true,
      data: {
        hasChanges: hasUpdates,
        timestamp: serverTimestamp,
      },
    };

    // 若有更新，附帶完整事件資料，減少一次往返
    if (hasUpdates) {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

      if (sheet) {
        const data = sheet.getDataRange().getValues();
        const events = [];

        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const isDeleted = row.length > 7 && (row[7] === true || String(row[7]).toUpperCase() === 'TRUE');
          if (isDeleted) continue;
          if (!row[0] && !row[2]) continue;

          events.push({
            startDate: formatDate(row[0]),
            endDate: formatDate(row[1]),
            content: String(row[2] || ''),
            notes: String(row[3] || ''),
            id: String(row[4] || ''),
            lastUpdated: row[5] ? String(row[5]) : '',
            createdBy: row.length > 6 ? String(row[6] || '') : '',
            startTime: row.length > 9 ? String(row[9] || '') : '',
            endTime: row.length > 10 ? String(row[10] || '') : '',
          });
        }

        response.data.events = events;
        response.data.count = events.length;
      }
    }

    return jsonResponse(response);
  } catch (err) {
    return jsonResponse({ success: false, error: '檢查更新失敗：' + err.message });
  }
}

/**
 * 處理 createEvent 動作 - 新增一筆行事曆事件
 */
function handleCreateEvent(request, user, role) {
  try {
    if (!requireRole(role, 'editor')) {
      return jsonResponse({ success: false, error: '權限不足，需要編輯者以上權限' });
    }

    const { startDate, endDate, content, notes, startTime, endTime } = request;

    // 驗證必填欄位
    if (!startDate || !content) {
      return jsonResponse({ success: false, error: '開始日期和活動內容為必填欄位' });
    }

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ success: false, error: '找不到行事曆工作表' });
    }

    const eventId = generateEventId();
    const now = new Date().toISOString();

    // 新增一列：A~K
    const newRow = [
      startDate,                    // A: 開始日期
      endDate || startDate,         // B: 結束日期（預設同開始日期）
      content,                      // C: 活動內容
      notes || '',                  // D: 備註
      eventId,                      // E: ID
      now,                          // F: 最後更新時間
      user.email,                   // G: 建立者
      false,                        // H: 是否刪除
      '',                           // I: 日曆事件ID
      startTime || '',              // J: 開始時間
      endTime || '',                // K: 結束時間
    ];

    sheet.appendRow(newRow);
    updateLastModified();

    return jsonResponse({
      success: true,
      data: {
        id: eventId,
        message: '事件已建立',
      },
    });
  } catch (err) {
    return jsonResponse({ success: false, error: '建立事件失敗：' + err.message });
  }
}

/**
 * 處理 updateEvent 動作 - 更新既有行事曆事件
 * 權限規則：編輯者只能修改自己建立的事件，管理員可修改所有事件
 */
function handleUpdateEvent(request, user, role) {
  try {
    if (!requireRole(role, 'editor')) {
      return jsonResponse({ success: false, error: '權限不足，需要編輯者以上權限' });
    }

    const { id, startDate, endDate, content, notes, startTime, endTime } = request;

    if (!id) {
      return jsonResponse({ success: false, error: '缺少事件 ID' });
    }

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ success: false, error: '找不到行事曆工作表' });
    }

    // 尋找目標列（ID 在 E 欄 = 第 5 欄）
    const rowNum = findRowById(sheet, id, 5);

    if (rowNum === -1) {
      return jsonResponse({ success: false, error: '找不到指定的事件' });
    }

    // 讀取現有資料以檢查權限
    const existingRow = sheet.getRange(rowNum, 1, 1, 8).getValues()[0];
    const createdBy = existingRow.length > 6 ? String(existingRow[6] || '').toLowerCase() : '';
    const isDeleted = existingRow.length > 7 && (existingRow[7] === true || String(existingRow[7]).toUpperCase() === 'TRUE');

    if (isDeleted) {
      return jsonResponse({ success: false, error: '此事件已被刪除' });
    }

    // 非管理員只能修改自己建立的事件
    if (role !== 'admin' && createdBy && createdBy !== user.email.toLowerCase()) {
      return jsonResponse({ success: false, error: '您只能修改自己建立的事件' });
    }

    const now = new Date().toISOString();

    // 更新欄位（僅更新有提供的欄位）
    if (startDate !== undefined) sheet.getRange(rowNum, 1).setValue(startDate);
    if (endDate !== undefined) sheet.getRange(rowNum, 2).setValue(endDate);
    if (content !== undefined) sheet.getRange(rowNum, 3).setValue(content);
    if (notes !== undefined) sheet.getRange(rowNum, 4).setValue(notes);
    if (startTime !== undefined) sheet.getRange(rowNum, 10).setValue(startTime);  // J: 開始時間
    if (endTime !== undefined) sheet.getRange(rowNum, 11).setValue(endTime);      // K: 結束時間
    sheet.getRange(rowNum, 6).setValue(now); // 更新最後修改時間

    updateLastModified();

    return jsonResponse({
      success: true,
      data: {
        id: id,
        message: '事件已更新',
      },
    });
  } catch (err) {
    return jsonResponse({ success: false, error: '更新事件失敗：' + err.message });
  }
}

/**
 * 處理 deleteEvent 動作 - 軟刪除事件（標記 是否刪除 = TRUE）
 * 權限規則：編輯者只能刪除自己建立的事件，管理員可刪除所有事件
 */
function handleDeleteEvent(request, user, role) {
  try {
    if (!requireRole(role, 'editor')) {
      return jsonResponse({ success: false, error: '權限不足，需要編輯者以上權限' });
    }

    const { id } = request;

    if (!id) {
      return jsonResponse({ success: false, error: '缺少事件 ID' });
    }

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ success: false, error: '找不到行事曆工作表' });
    }

    const rowNum = findRowById(sheet, id, 5);

    if (rowNum === -1) {
      return jsonResponse({ success: false, error: '找不到指定的事件' });
    }

    // 讀取現有資料以檢查權限
    const existingRow = sheet.getRange(rowNum, 1, 1, 8).getValues()[0];
    const createdBy = existingRow.length > 6 ? String(existingRow[6] || '').toLowerCase() : '';

    // 非管理員只能刪除自己建立的事件
    if (role !== 'admin' && createdBy && createdBy !== user.email.toLowerCase()) {
      return jsonResponse({ success: false, error: '您只能刪除自己建立的事件' });
    }

    // 軟刪除：設定 H 欄為 TRUE，並更新修改時間
    sheet.getRange(rowNum, 8).setValue(true);
    sheet.getRange(rowNum, 6).setValue(new Date().toISOString());

    updateLastModified();

    return jsonResponse({
      success: true,
      data: {
        id: id,
        message: '事件已刪除',
      },
    });
  } catch (err) {
    return jsonResponse({ success: false, error: '刪除事件失敗：' + err.message });
  }
}

/**
 * 處理 batchImport 動作 - 批次匯入多筆事件
 * request.events 為事件陣列
 */
function handleBatchImport(request, user, role) {
  try {
    if (!requireRole(role, 'editor')) {
      return jsonResponse({ success: false, error: '權限不足，需要編輯者以上權限' });
    }

    const events = request.events;

    if (!events || !Array.isArray(events) || events.length === 0) {
      return jsonResponse({ success: false, error: '沒有可匯入的事件資料' });
    }

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ success: false, error: '找不到行事曆工作表' });
    }

    const now = new Date().toISOString();
    let importedCount = 0;
    let skippedCount = 0;
    const newRows = [];

    for (const event of events) {
      // 驗證必填欄位（相容 content 或 title）
      const eventContent = event.content || event.title;
      if (!event.startDate || !eventContent) {
        skippedCount++;
        continue;
      }

      const eventId = event.id || generateEventId();

      newRows.push([
        event.startDate,
        event.endDate || event.startDate,
        eventContent,
        event.notes || event.note || '',
        eventId,
        now,
        user.email,
        false,
        '',                              // I: 日曆事件ID
        event.startTime || '',           // J: 開始時間
        event.endTime || '',             // K: 結束時間
      ]);

      importedCount++;
    }

    // 一次性批量寫入（效能最佳化）
    if (newRows.length > 0) {
      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, newRows.length, 11).setValues(newRows);
      updateLastModified();
    }

    return jsonResponse({
      success: true,
      data: {
        imported: importedCount,
        skipped: skippedCount,
        message: '已匯入 ' + importedCount + ' 筆事件' +
                 (skippedCount > 0 ? '，跳過 ' + skippedCount + ' 筆無效資料' : ''),
      },
    });
  } catch (err) {
    return jsonResponse({ success: false, error: '批次匯入失敗：' + err.message });
  }
}

// ===================== 系統設定 API =====================

/**
 * 處理 getSettings 動作 - 取得所有系統設定
 */
function handleGetSettings(user, role) {
  try {
    if (!requireRole(role, 'viewer')) {
      return jsonResponse({ success: false, error: '權限不足' });
    }

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ success: true, data: { settings: DEFAULT_SETTINGS } });
    }

    const data = sheet.getDataRange().getValues();
    const settings = {};

    for (let i = 1; i < data.length; i++) {
      const key = String(data[i][0]).trim();
      const value = data[i][1];
      if (key) {
        settings[key] = value !== undefined && value !== null ? String(value) : '';
      }
    }

    return jsonResponse({
      success: true,
      data: { settings: settings },
    });
  } catch (err) {
    return jsonResponse({ success: false, error: '取得設定失敗：' + err.message });
  }
}

/**
 * 處理 updateSettings 動作 - 更新系統設定值
 * 僅管理員可執行
 */
function handleUpdateSettings(request, user, role) {
  try {
    if (!requireRole(role, 'admin')) {
      return jsonResponse({ success: false, error: '權限不足，需要管理員權限' });
    }

    const { key, value, settings: bulkSettings } = request;

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ success: false, error: '找不到系統設定工作表' });
    }

    // 支援批次更新（傳入 settings 物件）
    const updates = bulkSettings ? bulkSettings : (key ? { [key]: value } : null);

    if (!updates) {
      return jsonResponse({ success: false, error: '缺少要更新的設定項目' });
    }

    const data = sheet.getDataRange().getValues();

    for (const [settingKey, settingValue] of Object.entries(updates)) {
      let found = false;

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === settingKey) {
          sheet.getRange(i + 1, 2).setValue(settingValue);
          found = true;
          break;
        }
      }

      // 若設定項目不存在，新增一筆
      if (!found) {
        sheet.appendRow([settingKey, settingValue]);
        // 重新讀取資料以便後續迴圈使用
        data.push([settingKey, settingValue]);
      }
    }

    return jsonResponse({
      success: true,
      data: { message: '設定已更新' },
    });
  } catch (err) {
    return jsonResponse({ success: false, error: '更新設定失敗：' + err.message });
  }
}

// ===================== 使用者管理 API =====================

/**
 * 處理 getUsers 動作 - 取得使用者清單
 * 僅管理員可執行
 */
function handleGetUsers(user, role) {
  try {
    if (!requireRole(role, 'admin')) {
      return jsonResponse({ success: false, error: '權限不足，需要管理員權限' });
    }

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.USERS_SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ success: true, data: { users: [] } });
    }

    const data = sheet.getDataRange().getValues();
    const users = [];

    for (let i = 1; i < data.length; i++) {
      const email = String(data[i][0]).trim();
      if (!email) continue;

      users.push({
        email: email,
        role: String(data[i][1] || 'viewer').toLowerCase(),
        name: String(data[i][2] || ''),
        enabled: data[i][3] !== false && String(data[i][3]).toUpperCase() !== 'FALSE',
      });
    }

    return jsonResponse({
      success: true,
      data: { users: users },
    });
  } catch (err) {
    return jsonResponse({ success: false, error: '取得使用者清單失敗：' + err.message });
  }
}

/**
 * 處理 addUser 動作 - 新增使用者到白名單
 * 僅管理員可執行
 */
function handleAddUser(request, user, role) {
  try {
    if (!requireRole(role, 'admin')) {
      return jsonResponse({ success: false, error: '權限不足，需要管理員權限' });
    }

    const { email, userRole, name } = request;

    if (!email) {
      return jsonResponse({ success: false, error: '缺少使用者 Email' });
    }

    const emailLower = email.toLowerCase().trim();

    // 驗證角色
    const validRole = userRole && ROLE_LEVELS[userRole] ? userRole : 'viewer';

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.USERS_SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ success: false, error: '找不到使用者管理工作表' });
    }

    // 檢查是否已存在
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase().trim() === emailLower) {
        return jsonResponse({ success: false, error: '此 Email 已存在於使用者清單中' });
      }
    }

    // 新增使用者
    sheet.appendRow([emailLower, validRole, name || '', true]);

    return jsonResponse({
      success: true,
      data: { message: '已新增使用者：' + emailLower },
    });
  } catch (err) {
    return jsonResponse({ success: false, error: '新增使用者失敗：' + err.message });
  }
}

/**
 * 處理 removeUser 動作 - 從白名單移除使用者
 * 僅管理員可執行
 */
function handleRemoveUser(request, user, role) {
  try {
    if (!requireRole(role, 'admin')) {
      return jsonResponse({ success: false, error: '權限不足，需要管理員權限' });
    }

    const { email } = request;

    if (!email) {
      return jsonResponse({ success: false, error: '缺少使用者 Email' });
    }

    const emailLower = email.toLowerCase().trim();

    // 不允許移除 ADMIN_EMAILS 中的管理員
    if (CONFIG.ADMIN_EMAILS.map(e => e.toLowerCase()).includes(emailLower)) {
      return jsonResponse({ success: false, error: '無法移除系統預設管理員' });
    }

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.USERS_SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ success: false, error: '找不到使用者管理工作表' });
    }

    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase().trim() === emailLower) {
        sheet.deleteRow(i + 1); // 1-based 列號
        return jsonResponse({
          success: true,
          data: { message: '已移除使用者：' + emailLower },
        });
      }
    }

    return jsonResponse({ success: false, error: '找不到指定的使用者' });
  } catch (err) {
    return jsonResponse({ success: false, error: '移除使用者失敗：' + err.message });
  }
}

/**
 * 處理 updateUser 動作 - 更新使用者角色或狀態
 * 僅管理員可執行
 */
function handleUpdateUser(request, user, role) {
  try {
    if (!requireRole(role, 'admin')) {
      return jsonResponse({ success: false, error: '權限不足，需要管理員權限' });
    }

    const { email, userRole, name, enabled } = request;

    if (!email) {
      return jsonResponse({ success: false, error: '缺少使用者 Email' });
    }

    const emailLower = email.toLowerCase().trim();

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.USERS_SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ success: false, error: '找不到使用者管理工作表' });
    }

    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase().trim() === emailLower) {
        const rowNum = i + 1;

        // 更新角色
        if (userRole !== undefined && ROLE_LEVELS[userRole]) {
          sheet.getRange(rowNum, 2).setValue(userRole);
        }

        // 更新姓名
        if (name !== undefined) {
          sheet.getRange(rowNum, 3).setValue(name);
        }

        // 更新啟用狀態
        if (enabled !== undefined) {
          sheet.getRange(rowNum, 4).setValue(enabled);
        }

        return jsonResponse({
          success: true,
          data: { message: '已更新使用者資訊：' + emailLower },
        });
      }
    }

    return jsonResponse({ success: false, error: '找不到指定的使用者' });
  } catch (err) {
    return jsonResponse({ success: false, error: '更新使用者失敗：' + err.message });
  }
}

// ===================== Google Sheet 匯入 =====================

/**
 * 處理 importFromSheet 動作 - 從另一個 Google Sheet 匯入事件
 * 讀取來源 Sheet 第一個工作表，自動對應欄位並匯入
 */
function handleImportFromSheet(request, user, role) {
  try {
    if (!requireRole(role, 'editor')) {
      return jsonResponse({ success: false, error: '權限不足，需要編輯者以上權限' });
    }

    const { sheetId } = request;

    if (!sheetId) {
      return jsonResponse({ success: false, error: '缺少 Google Sheet ID' });
    }

    // 開啟來源 Sheet
    let sourceSheet;
    try {
      const sourceSS = SpreadsheetApp.openById(sheetId);
      sourceSheet = sourceSS.getSheets()[0]; // 讀取第一個工作表
    } catch (e) {
      return jsonResponse({ success: false, error: '無法開啟指定的 Google Sheet，請確認 ID 正確且已共用' });
    }

    const sourceData = sourceSheet.getDataRange().getValues();
    if (sourceData.length < 2) {
      return jsonResponse({ success: false, error: '來源 Sheet 沒有資料' });
    }

    // 分析標題列，建立欄位對應
    const headers = sourceData[0].map(h => String(h).trim().toLowerCase());
    const colMap = { startDate: -1, endDate: -1, content: -1, notes: -1 };

    headers.forEach((h, idx) => {
      if (['開始日期', 'startdate', '日期', '開始', 'start'].includes(h)) colMap.startDate = idx;
      else if (['結束日期', 'enddate', '結束', 'end'].includes(h)) colMap.endDate = idx;
      else if (['活動內容', 'content', '活動', '內容', 'title', '名稱'].includes(h)) colMap.content = idx;
      else if (['備註', 'notes', 'note', '說明', 'description'].includes(h)) colMap.notes = idx;
    });

    if (colMap.startDate === -1 || colMap.content === -1) {
      return jsonResponse({ success: false, error: '來源 Sheet 缺少必要欄位（開始日期、活動內容）' });
    }

    // 讀取資料
    const targetSS = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const targetSheet = targetSS.getSheetByName(CONFIG.SHEET_NAME);

    if (!targetSheet) {
      return jsonResponse({ success: false, error: '找不到行事曆工作表' });
    }

    const now = new Date().toISOString();
    const newRows = [];
    let importedCount = 0;
    let skippedCount = 0;

    for (let i = 1; i < sourceData.length; i++) {
      const row = sourceData[i];
      const startDate = formatDate(row[colMap.startDate]);
      const content = String(row[colMap.content] || '').trim();

      if (!startDate || !content) {
        skippedCount++;
        continue;
      }

      const endDate = colMap.endDate >= 0 ? formatDate(row[colMap.endDate]) : startDate;
      const notes = colMap.notes >= 0 ? String(row[colMap.notes] || '').trim() : '';

      newRows.push([
        startDate,
        endDate || startDate,
        content,
        notes,
        generateEventId(),
        now,
        user.email,
        false,
      ]);
      importedCount++;
    }

    if (newRows.length > 0) {
      const lastRow = targetSheet.getLastRow();
      targetSheet.getRange(lastRow + 1, 1, newRows.length, 8).setValues(newRows);
      updateLastModified();
    }

    return jsonResponse({
      success: true,
      data: {
        imported: importedCount,
        skipped: skippedCount,
        message: '已從 Google Sheet 匯入 ' + importedCount + ' 筆事件' +
                 (skippedCount > 0 ? '，跳過 ' + skippedCount + ' 筆無效資料' : ''),
      },
    });
  } catch (err) {
    return jsonResponse({ success: false, error: '從 Google Sheet 匯入失敗：' + err.message });
  }
}

// ===================== Google Calendar 同步 =====================

/**
 * 處理 syncToCalendar 動作 - 將行事曆事件同步到 Google Calendar
 * 僅管理員可執行
 * 邏輯：透過 I 欄儲存的 Calendar Event ID 進行智慧同步
 *   - 有 ID → 更新既有日曆事件（標題、日期）
 *   - 沒 ID → 新建日曆事件，將 ID 寫回 Sheet
 *   - 已刪除且有 ID → 從日曆刪除該事件，清除 ID
 */
function handleSyncToCalendar(user, role) {
  try {
    if (!requireRole(role, 'admin')) {
      return jsonResponse({ success: false, error: '權限不足，需要管理員權限' });
    }

    const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
    if (!calendar) {
      return jsonResponse({ success: false, error: '無法存取 Google Calendar，請確認日曆 ID 是否正確' });
    }

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ success: false, error: '找不到行事曆工作表' });
    }

    const data = sheet.getDataRange().getValues();
    let createdCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0] && !row[2]) continue; // 跳過完全空白列

      const isDeleted = row.length > 7 && (row[7] === true || String(row[7]).toUpperCase() === 'TRUE');
      const calendarEventId = row.length > 8 ? String(row[8] || '').trim() : '';

      try {
        // 已刪除的事件：如果有日曆 ID，從日曆移除
        if (isDeleted) {
          if (calendarEventId) {
            try {
              const existingEvent = calendar.getEventById(calendarEventId);
              if (existingEvent) {
                existingEvent.deleteEvent();
                deletedCount++;
              }
            } catch (e) {
              // 事件可能已被手動刪除，忽略
            }
            sheet.getRange(i + 1, 9).setValue(''); // 清除日曆事件 ID
          }
          continue;
        }

        if (!row[0] || !row[2]) continue;

        const title = String(row[2]);
        const eventNotes = row[3] ? String(row[3]) : '';
        const startDateStr = formatDate(row[0]);
        const endDateStr = formatDate(row[1] || row[0]);
        const startTime = row.length > 9 ? formatTime(row[9]) : '';
        const endTime = row.length > 10 ? formatTime(row[10]) : '';
        const isTimed = !!startTime;

        // 已有日曆事件 ID → 更新既有事件
        if (calendarEventId) {
          let existingEvent = null;
          try {
            existingEvent = calendar.getEventById(calendarEventId);
          } catch (e) {
            // ID 無效，當作新建
          }

          if (existingEvent) {
            existingEvent.setTitle(title);
            existingEvent.setDescription(eventNotes);

            if (isTimed) {
              const startDT = new Date(startDateStr + 'T' + startTime + ':00');
              const endDT = endTime
                ? new Date(endDateStr + 'T' + endTime + ':00')
                : new Date(startDT.getTime() + 3600000);
              existingEvent.setTime(startDT, endDT);
            } else if (startDateStr === endDateStr) {
              existingEvent.setAllDayDate(new Date(startDateStr + 'T00:00:00'));
            } else {
              const endDatePlusOne = new Date(new Date(endDateStr + 'T00:00:00').getTime() + 86400000);
              existingEvent.setAllDayDates(new Date(startDateStr + 'T00:00:00'), endDatePlusOne);
            }
            updatedCount++;
            continue;
          }
        }

        // 新建日曆事件
        let newEvent;
        if (isTimed) {
          const startDT = new Date(startDateStr + 'T' + startTime + ':00');
          const endDT = endTime
            ? new Date(endDateStr + 'T' + endTime + ':00')
            : new Date(startDT.getTime() + 3600000);
          newEvent = calendar.createEvent(title, startDT, endDT);
        } else if (startDateStr === endDateStr) {
          newEvent = calendar.createAllDayEvent(title, new Date(startDateStr + 'T00:00:00'));
        } else {
          const endDatePlusOne = new Date(new Date(endDateStr + 'T00:00:00').getTime() + 86400000);
          newEvent = calendar.createAllDayEvent(title, new Date(startDateStr + 'T00:00:00'), endDatePlusOne);
        }

        if (eventNotes) {
          newEvent.setDescription(eventNotes);
        }

        // 將日曆事件 ID 寫回 Sheet I 欄
        sheet.getRange(i + 1, 9).setValue(newEvent.getId());
        createdCount++;

      } catch (eventErr) {
        errorCount++;
        errors.push('第 ' + (i + 1) + ' 列：' + eventErr.message);
      }
    }

    const parts = [];
    if (createdCount > 0) parts.push('新增 ' + createdCount + ' 筆');
    if (updatedCount > 0) parts.push('更新 ' + updatedCount + ' 筆');
    if (deletedCount > 0) parts.push('刪除 ' + deletedCount + ' 筆');
    if (errorCount > 0) parts.push('失敗 ' + errorCount + ' 筆');
    const summary = '同步完成：' + (parts.length > 0 ? parts.join('，') : '無需變更');

    return jsonResponse({
      success: true,
      data: {
        created: createdCount,
        updated: updatedCount,
        deleted: deletedCount,
        errorCount: errorCount,
        errors: errors.slice(0, 10),
        message: summary,
      },
    });
  } catch (err) {
    return jsonResponse({ success: false, error: '同步至日曆失敗：' + err.message });
  }
}

// ===================== 除錯與維護工具 =====================

/**
 * 手動初始化工作表（可在 GAS 編輯器中直接執行）
 * 用於首次部署時手動建立所需的工作表和欄位
 */
function manualInit() {
  ensureSheetsInitialized();
  Logger.log('工作表初始化完成');
}

/**
 * 檢視目前系統狀態（除錯用）
 * 可在 GAS 編輯器中直接執行
 */
function debugStatus() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  // 列出所有工作表
  const sheets = ss.getSheets();
  Logger.log('=== 工作表清單 ===');
  sheets.forEach(function (s) {
    Logger.log(s.getName() + ' (' + s.getLastRow() + ' 列)');
  });

  // 檢查行事曆工作表
  const calSheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (calSheet) {
    const headers = calSheet.getRange(1, 1, 1, 8).getValues()[0];
    Logger.log('=== 行事曆工作表欄位 ===');
    Logger.log(headers.join(' | '));
    Logger.log('資料列數：' + (calSheet.getLastRow() - 1));
  }

  // 檢查 lastModified
  Logger.log('=== lastModified ===');
  Logger.log(getLastModified());
}
