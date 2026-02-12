/**
 * API 客戶端模組 - 封裝所有對 GAS REST API 的呼叫
 */
const API = {
  /**
   * 呼叫 GAS API
   * @param {string} action - API action 名稱
   * @param {object} params - 額外參數
   * @returns {Promise<object>} API 回應
   */
  async call(action, params = {}) {
    const body = {
      action,
      token: Auth.getToken(),
      ...params,
    };

    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error('API 回應格式錯誤: ' + text.substring(0, 200));
      }

      // 自動展平 data 欄位：GAS 回傳 { success, data: {...} }，展平為 { success, ...data }
      if (result && result.data && typeof result.data === 'object') {
        const { data, ...rest } = result;
        return { ...rest, ...data };
      }
      return result;
    } catch (err) {
      console.error(`API 呼叫失敗 [${action}]:`, err);
      throw err;
    }
  },

  /**
   * 輕量 GET 呼叫（用於高頻輪詢）
   */
  async checkForUpdates(lastTimestamp) {
    const params = new URLSearchParams({
      action: 'checkForUpdates',
      token: Auth.getToken() || '',
      lastTimestamp: lastTimestamp || '',
    });

    try {
      const response = await fetch(`${CONFIG.API_URL}?${params}`, {
        method: 'GET',
        redirect: 'follow',
      });

      const text = await response.text();
      let result = JSON.parse(text);

      // 自動展平 data 欄位
      if (result && result.data && typeof result.data === 'object') {
        const { data, ...rest } = result;
        result = { ...rest, ...data };
      }
      return result;
    } catch (err) {
      console.error('輪詢失敗:', err);
      throw err;
    }
  },

  // ===== 事件 CRUD =====
  async getEvents() {
    return this.call('getEvents');
  },

  async createEvent(eventData) {
    // GAS 期待平坦的 { startDate, endDate, content, notes }
    return this.call('createEvent', eventData);
  },

  async updateEvent(eventId, eventData) {
    // GAS 期待 { id, startDate, endDate, content, notes }
    return this.call('updateEvent', { id: eventId, ...eventData });
  },

  async deleteEvent(eventId) {
    // GAS 期待 { id }
    return this.call('deleteEvent', { id: eventId });
  },

  async batchImport(events) {
    return this.call('batchImport', { events });
  },

  // ===== 系統設定 =====
  async getSettings() {
    return this.call('getSettings');
  },

  async updateSettings(key, value) {
    return this.call('updateSettings', { key, value });
  },

  // ===== 使用者管理 =====
  async getUsers() {
    return this.call('getUsers');
  },

  async addUser(email, role, name) {
    // GAS 期待 userRole（避免與 request 的 role 混淆）
    return this.call('addUser', { email, userRole: role, name });
  },

  async removeUser(email) {
    return this.call('removeUser', { email });
  },

  async updateUser(email, role) {
    // GAS 期待 userRole
    return this.call('updateUser', { email, userRole: role });
  },

  // ===== 其他 =====
  async syncToCalendar() {
    return this.call('syncToCalendar');
  },

  async testConnection() {
    return this.call('testConnection');
  },
};
