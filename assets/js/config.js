/**
 * 行事曆共編系統 - 全域設定
 * 部署前請填入正確的值
 */
const CONFIG = {
  // GAS Web App 部署 URL（部署後取得）
  API_URL: 'https://script.google.com/macros/s/AKfycbzzXN_6M9Xtc60pboXZfOGbGOT6JTd7lmgiQiLfkU7aUOKVy59YH4Y_K0DBc1E5Uh4u5A/exec',

  // Google OAuth 2.0 Client ID（從 Google Cloud Console 取得）
  GOOGLE_CLIENT_ID: '356854070080-tue0jk4grlmm7j85htdla5umakr83pl8.apps.googleusercontent.com',

  // Google Sheet ID（資料來源）
  SPREADSHEET_ID: '16syUGJF3he9TmkATzDzw0yF8Wq93ctVnHtwJQUeKN5c',

  // Google Sheets 連結（檢視用）
  SHEETS_URL: 'https://docs.google.com/spreadsheets/d/16syUGJF3he9TmkATzDzw0yF8Wq93ctVnHtwJQUeKN5c/edit',

  // Google Calendar ID（同步用）
  CALENDAR_ID: 'ksps1@ksps.ntct.edu.tw',

  // 輪詢間隔（毫秒）
  POLL_INTERVAL: 8000,
  POLL_INTERVAL_BACKGROUND: 30000,

  // 學期設定（預設值，會被系統設定覆蓋）
  DEFAULT_SEMESTER_START: '2025-08-24',
  DEFAULT_SEMESTER_END: '2026-01-24',
  DEFAULT_TITLE: '南投縣國姓國小114學年度第1學期學校重要行事曆',
};
