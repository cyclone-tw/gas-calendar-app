/**
 * 管理面板模組 - 使用者管理 + 系統設定
 */
const AdminPanel = {
  currentTab: 'users',

  open() {
    if (!Auth.isAdmin()) {
      UI.showToast('只有管理員可以存取管理面板', 'error');
      return;
    }
    UI.openModal('adminModal');
    this.switchTab('users');
    this.loadUsers();
  },

  close() {
    UI.closeModal('adminModal');
  },

  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('#adminModal .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('usersTab').classList.toggle('hidden', tab !== 'users');
    document.getElementById('settingsTab').classList.toggle('hidden', tab !== 'settings');

    // 標記 active tab
    const tabBtns = document.querySelectorAll('#adminModal .tab-btn');
    tabBtns.forEach(btn => {
      if ((tab === 'users' && btn.textContent.includes('使用者')) ||
          (tab === 'settings' && btn.textContent.includes('系統'))) {
        btn.classList.add('active');
      }
    });

    if (tab === 'settings') this.loadSettings();
    if (tab === 'users') this.loadUsers();
  },

  // ===== 使用者管理 =====
  async loadUsers() {
    const list = document.getElementById('userList');
    list.innerHTML = '<p class="loading-text">載入中...</p>';

    try {
      const result = await API.getUsers();
      if (result.success) {
        this.renderUserList(result.users);
      } else {
        list.innerHTML = '<p class="error-text">載入失敗</p>';
      }
    } catch (err) {
      list.innerHTML = '<p class="error-text">載入失敗: ' + UI.escapeHtml(err.message) + '</p>';
    }
  },

  renderUserList(users) {
    const list = document.getElementById('userList');
    if (!users || users.length === 0) {
      list.innerHTML = '<p class="loading-text">尚無使用者</p>';
      return;
    }

    const roleLabels = { admin: '管理員', editor: '編輯者', viewer: '檢視者' };

    list.innerHTML = users.map(user => `
      <div class="user-item">
        <div class="user-info">
          <span class="user-email">${UI.escapeHtml(user.email)}</span>
          <span class="user-name">${UI.escapeHtml(user.name || '')}</span>
          <span class="role-badge role-${user.role}">${roleLabels[user.role] || user.role}</span>
          ${user.enabled === false ? '<span class="badge-inactive">停用</span>' : ''}
        </div>
        <div class="user-actions">
          <select class="form-input form-input-sm" onchange="AdminPanel.changeRole('${UI.escapeHtml(user.email)}', this.value)">
            <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>編輯者</option>
            <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>檢視者</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理員</option>
          </select>
          <button class="btn btn-danger btn-sm" onclick="AdminPanel.removeUser('${UI.escapeHtml(user.email)}')">移除</button>
        </div>
      </div>
    `).join('');
  },

  async addUser() {
    const email = document.getElementById('newUserEmail').value.trim();
    const name = document.getElementById('newUserName').value.trim();
    const role = document.getElementById('newUserRole').value;

    if (!email) {
      UI.showToast('請輸入 Gmail 帳號', 'error');
      return;
    }

    if (!email.includes('@')) {
      UI.showToast('請輸入有效的 Email', 'error');
      return;
    }

    try {
      const result = await API.addUser(email, role, name);
      if (result.success) {
        UI.showToast('使用者新增成功', 'success');
        document.getElementById('newUserEmail').value = '';
        document.getElementById('newUserName').value = '';
        this.loadUsers();
      } else {
        UI.showToast('新增失敗: ' + (result.error || ''), 'error');
      }
    } catch (err) {
      UI.showToast('新增失敗: ' + err.message, 'error');
    }
  },

  async removeUser(email) {
    const confirmed = await UI.confirm('移除使用者', `確定要移除 ${email} 嗎？`);
    if (!confirmed) return;

    try {
      const result = await API.removeUser(email);
      if (result.success) {
        UI.showToast('使用者已移除', 'success');
        this.loadUsers();
      } else {
        UI.showToast('移除失敗: ' + (result.error || ''), 'error');
      }
    } catch (err) {
      UI.showToast('移除失敗: ' + err.message, 'error');
    }
  },

  async changeRole(email, newRole) {
    try {
      const result = await API.updateUser(email, newRole);
      if (result.success) {
        UI.showToast('角色已更新', 'success');
      } else {
        UI.showToast('更新失敗: ' + (result.error || ''), 'error');
        this.loadUsers(); // 重新載入以還原
      }
    } catch (err) {
      UI.showToast('更新失敗: ' + err.message, 'error');
      this.loadUsers();
    }
  },

  // ===== 系統設定 =====
  async loadSettings() {
    try {
      const result = await API.getSettings();
      if (result.success && result.settings) {
        const s = result.settings;
        document.getElementById('settingSemesterStart').value = s.semesterStart || '';
        document.getElementById('settingSemesterEnd').value = s.semesterEnd || '';
        document.getElementById('settingTitle').value = s.calendarTitle || '';
        document.getElementById('settingCalendarId').value = s.googleCalendarId || '';
      }
    } catch (err) {
      UI.showToast('載入設定失敗', 'error');
    }
  },

  async saveSettings() {
    const settings = {
      semesterStart: document.getElementById('settingSemesterStart').value,
      semesterEnd: document.getElementById('settingSemesterEnd').value,
      calendarTitle: document.getElementById('settingTitle').value,
      googleCalendarId: document.getElementById('settingCalendarId').value,
    };

    try {
      // 批次更新，一次 API 呼叫
      await API.call('updateSettings', { settings });
      EventStore.updateSettings(settings);
      UI.showToast('設定已儲存', 'success');

      // 更新主頁顯示
      const display = document.getElementById('dateRangeDisplay');
      if (display) {
        display.innerHTML = `<strong>${EventStore.formatDateChinese(settings.semesterStart)} 至 ${EventStore.formatDateChinese(settings.semesterEnd)}</strong>`;
      }
      const titleInput = document.getElementById('exportTitle');
      if (titleInput) titleInput.value = settings.calendarTitle;

      // 重新渲染表格
      Table.render();
    } catch (err) {
      UI.showToast('儲存失敗: ' + err.message, 'error');
    }
  },

  // ===== 除錯工具 =====
  async testConnection() {
    UI.log('測試連線中...');
    try {
      const result = await API.testConnection();
      if (result.success) {
        UI.log('連線成功: ' + result.message, 'success');
        UI.showToast('連線正常', 'success');
      } else {
        UI.log('連線失敗: ' + (result.error || ''), 'error');
        UI.showToast('連線失敗', 'error');
      }
    } catch (err) {
      UI.log('連線錯誤: ' + err.message, 'error');
      UI.showToast('連線錯誤', 'error');
    }
  },

  showStats() {
    const events = EventStore.getAll();
    const now = new Date();
    const thisMonth = events.filter(e => {
      const d = new Date(e.startDate);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    UI.log(`活動總數: ${events.length}`);
    UI.log(`本月活動: ${thisMonth.length}`);
    UI.log(`學期範圍: ${EventStore.settings.semesterStart} ~ ${EventStore.settings.semesterEnd}`);
  },
};
