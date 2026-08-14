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
    const startKey = this.normalizeDate(start);
    const endKey = this.normalizeDate(end);
    return this.getAll().filter(ev => {
      const evStart = this.normalizeDate(ev.startDate);
      const evEnd = this.normalizeDate(ev.endDate || ev.startDate);
      return evStart && endKey && evStart <= endKey && evEnd >= startKey;
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
    if (settings.semesterStart) this.settings.semesterStart = this.normalizeDate(settings.semesterStart);
    if (settings.semesterEnd) this.settings.semesterEnd = this.normalizeDate(settings.semesterEnd);
    if (settings.calendarTitle) this.settings.calendarTitle = settings.calendarTitle;
    if (settings.googleCalendarId) this.settings.googleCalendarId = settings.googleCalendarId;
    this._notify('settingsUpdated');
  },

  // ===== 週次計算 =====
  calculateWeekNumber(date) {
    const d = this.parseLocalDate(date);
    const start = this.parseLocalDate(this.settings.semesterStart);
    if (!d || !start) return -1;
    // 取得學期開始那一週的週日
    const startSunday = new Date(start);
    startSunday.setDate(start.getDate() - start.getDay());
    const diffDays = Math.round((d - startSunday) / (24 * 60 * 60 * 1000));
    const weekNum = Math.floor(diffDays / 7);
    return weekNum >= 0 ? weekNum : -1;
  },

  generateWeeks() {
    const weeks = [];
    const start = this.parseLocalDate(this.settings.semesterStart);
    const end = this.parseLocalDate(this.settings.semesterEnd);
    if (!start || !end) return weeks;
    let current = new Date(start);
    let weekNum = 0;

    while (current <= end) {
      const weekStart = new Date(current);
      const weekEnd = new Date(current);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekEndClamped = weekEnd > end ? new Date(end) : new Date(weekEnd);

      weeks.push({
        num: weekNum,
        label: weekNum === 0 ? '預備週' : String(weekNum),
        start: this.formatDate(weekStart),
        end: this.formatDate(weekEndClamped),
        startDate: new Date(weekStart),
        endDate: weekEndClamped,
      });

      current.setDate(current.getDate() + 7);
      weekNum++;
    }
    return weeks;
  },

  isDateInWeek(dateVal, weekStart, weekEnd) {
    const dateKey = this.normalizeDate(dateVal);
    const startKey = this.normalizeDate(weekStart);
    const endKey = this.normalizeDate(weekEnd);
    return !!(dateKey && startKey && endKey && dateKey >= startKey && dateKey <= endKey);
  },

  isInSemester(dateVal) {
    return this.isDateInWeek(dateVal, this.settings.semesterStart, this.settings.semesterEnd);
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
    if (!val && val !== 0) return '';
    if (val instanceof Date) {
      return this.formatDate(val);
    }
    const s = String(val).trim();
    // 純日曆日不可當 UTC 解析，否則週六會錯位
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
      return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    }
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return this.formatDate(parsed);
    }
    return '';
  },

  parseLocalDate(dateVal) {
    const key = this.normalizeDate(dateVal);
    const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  },

  addDays(dateVal, days) {
    const d = this.parseLocalDate(dateVal);
    if (!d) return '';
    d.setDate(d.getDate() + days);
    return this.formatDate(d);
  },

  formatDate(date) {
    if (typeof date === 'string') {
      const key = this.normalizeDate(date);
      if (key) return key;
    }
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  formatDateChinese(date) {
    const d = this.parseLocalDate(date) || (date instanceof Date ? date : new Date(date));
    if (!d || isNaN(d.getTime())) return '';
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  },

  formatActivityDate(dateStr, startTime, endTime) {
    const d = this.parseLocalDate(dateStr);
    if (!d) return '';
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    let result = `${m}-${day}(${weekDays[d.getDay()]})`;
    const validTime = (t) => t && /^\d{1,2}:\d{2}$/.test(t);
    if (validTime(startTime)) {
      result += ` ${startTime}`;
      if (validTime(endTime)) result += `-${endTime}`;
    }
    return result;
  },

  generateId() {
    return Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  },
};
