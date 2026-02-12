/**
 * UI 元件模組 - Toast、Loading、Modal、Console
 */
const UI = {
  // ===== Toast 通知 =====
  showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-dismiss');
      toast.addEventListener('animationend', () => toast.remove());
    }, duration);
  },

  // ===== Loading Overlay =====
  showLoading(show = true) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
  },

  // ===== Inline Loader =====
  showLoader(show = true) {
    const loader = document.getElementById('loader');
    if (show) {
      loader.classList.remove('hidden');
    } else {
      loader.classList.add('hidden');
    }
  },

  // ===== Message Bar =====
  showMessage(text, type = 'info') {
    const el = document.getElementById('message');
    el.textContent = text;
    el.className = `message message-${type}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
  },

  // ===== Modal =====
  openModal(id) {
    document.getElementById(id).classList.remove('hidden');
  },

  closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  },

  // ===== Confirm Dialog =====
  _confirmResolve: null,

  confirm(title, message) {
    return new Promise((resolve) => {
      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmMessage').textContent = message;
      this.openModal('confirmModal');
      this._confirmResolve = resolve;
    });
  },

  confirmAccept() {
    this.closeModal('confirmModal');
    if (this._confirmResolve) this._confirmResolve(true);
    this._confirmResolve = null;
  },

  confirmReject() {
    this.closeModal('confirmModal');
    if (this._confirmResolve) this._confirmResolve(false);
    this._confirmResolve = null;
  },

  // ===== Debug Console =====
  log(message, type = 'info') {
    const el = document.getElementById('console');
    if (!el) return;
    const time = new Date().toLocaleTimeString('zh-TW');
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    el.textContent += `[${time}] ${prefix} ${message}\n`;
    el.scrollTop = el.scrollHeight;
  },

  clearConsole() {
    const el = document.getElementById('console');
    if (el) el.textContent = '';
  },

  toggleDebug() {
    const body = document.querySelector('.debug-body');
    const icon = document.querySelector('.toggle-icon');
    if (body) {
      body.classList.toggle('collapsed');
      if (icon) icon.textContent = body.classList.contains('collapsed') ? '▶' : '▼';
    }
  },

  // ===== Sync Indicator =====
  setSyncStatus(status) {
    const el = document.getElementById('syncIndicator');
    if (!el) return;
    el.className = 'sync-indicator';
    switch (status) {
      case 'synced':
        el.classList.add('sync-ok');
        el.title = '已同步';
        break;
      case 'syncing':
        el.classList.add('sync-active');
        el.title = '同步中...';
        break;
      case 'error':
        el.classList.add('sync-error');
        el.title = '同步錯誤';
        break;
      default:
        el.title = '未連線';
    }
  },

  // ===== Role-based Visibility =====
  applyRoleVisibility(role) {
    // Admin-only elements
    document.querySelectorAll('.admin-only').forEach(el => {
      el.classList.toggle('hidden', role !== 'admin');
    });
    document.querySelectorAll('#btnAdmin, #debugPanel').forEach(el => {
      if (role === 'admin') {
        el.classList.remove('hidden');
        el.style.display = '';  // 清除 inline display:none
      } else {
        el.classList.add('hidden');
      }
    });

    // Editor+ elements (hide for viewer)
    document.querySelectorAll('.editor-only').forEach(el => {
      el.classList.toggle('hidden', role === 'viewer');
    });

    // Hide form for viewers
    const formPanel = document.getElementById('eventFormPanel');
    if (formPanel) {
      formPanel.classList.toggle('hidden', role === 'viewer');
    }
  },

  // ===== HTML Escape =====
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
};
