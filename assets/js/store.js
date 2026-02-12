/**
 * EventStore - 集中管理事件資料
 */
const EventStore = {
  events: [],
  lastTimestamp: null,
  settings: {
    semesterStart: CONFIG.DEFAULT_SEMESTER_START,
    semesterEnd: CONFIG.DEFAULT_SEMESTER_END,
    calendarTitle: CONFIG.DEFAULT_TITLE,
    googleCalendarId: CONFIG.CALENDAR_ID,
  },
  modifiedIds: new Set(),
  _listeners: [],

  // ===== 事件管理 =====
  updateAll(events, timestamp) {
    this.events = events.map(e => ({
      ...e,
      startDate: this.normalizeDate(e.startDate),
      endDate: this.normalizeDate(e.endDate || e.startDate),
    }));
    if (timestamp) this.lastTimestamp = timestamp;
    this._notify('eventsUpdated');
  },

  getAll() {
    return this.events.filter(e => !e.isDeleted);
  },

  getById(id) {
    return this.events.find(e => e.id === id);
  },

  getByDateRange(start, end) {
    const s = new Date(start);
    const e = new Date(end);
    return this.getAll().filter(ev => {
      const evStart = new Date(ev.startDate);
      const evEnd = new Date(ev.endDate);
      return evStart <= e && evEnd >= s;
    });
  },

  getByWeek(weekStart, weekEnd) {
    return this.getByDateRange(weekStart, weekEnd);
  },

  addLocal(event) {
    this.events.push(event);
    this._notify('eventsUpdated');
  },

  updateLocal(id, data) {
    const idx = this.events.findIndex(e => e.id === id);
    if (idx !== -1) {
      this.events[idx] = { ...this.events[idx], ...data };
      this._notify('eventsUpdated');
    }
  },

  removeLocal(id) {
    this.events = this.events.filter(e => e.id !== id);
    this._notify('eventsUpdated');
  },

  // ===== 設定管理 =====
  updateSettings(settings) {
    if (settings.semesterStart) this.settings.semesterStart = settings.semesterStart;
    if (settings.semesterEnd) this.settings.semesterEnd = settings.semesterEnd;
    if (settings.calendarTitle) this.settings.calendarTitle = settings.calendarTitle;
    if (settings.googleCalendarId) this.settings.googleCalendarId = settings.googleCalendarId;
    this._notify('settingsUpdated');
  },

  // ===== 週次計算 =====
  calculateWeekNumber(date) {
    const d = new Date(date);
    const start = new Date(this.settings.semesterStart);
    // 取得學期開始那一週的週日
    const startSunday = new Date(start);
    startSunday.setDate(start.getDate() - start.getDay());
    const diff = d - startSunday;
    const weekNum = Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
    return weekNum >= 0 ? weekNum : -1;
  },

  generateWeeks() {
    const weeks = [];
    const start = new Date(this.settings.semesterStart);
    const end = new Date(this.settings.semesterEnd);
    let current = new Date(start);
    let weekNum = 0;

    while (current <= end) {
      const weekStart = new Date(current);
      const weekEnd = new Date(current);
      weekEnd.setDate(weekEnd.getDate() + 6);

      weeks.push({
        num: weekNum,
        start: this.formatDate(weekStart),
        end: this.formatDate(weekEnd > end ? end : weekEnd),
        startDate: new Date(weekStart),
        endDate: new Date(weekEnd),
      });

      current.setDate(current.getDate() + 7);
      weekNum++;
    }
    return weeks;
  },

  // ===== 觀察者模式 =====
  on(event, callback) {
    this._listeners.push({ event, callback });
  },

  _notify(event) {
    this._listeners
      .filter(l => l.event === event)
      .forEach(l => l.callback());
  },

  // ===== 工具函式 =====
  normalizeDate(val) {
    if (!val) return '';
    if (val instanceof Date) {
      return this.formatDate(val);
    }
    // 處理 ISO 格式
    if (typeof val === 'string' && val.includes('T')) {
      return val.split('T')[0];
    }
    return String(val);
  },

  formatDate(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  formatDateChinese(date) {
    const d = new Date(date);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  },

  formatActivityDate(dateStr, startTime, endTime) {
    const d = new Date(dateStr);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    let result = `${m}-${day}(${weekDays[d.getDay()]})`;
    if (startTime) {
      result += ` ${startTime}`;
      if (endTime) result += `-${endTime}`;
    }
    return result;
  },

  generateId() {
    return Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  },
};
