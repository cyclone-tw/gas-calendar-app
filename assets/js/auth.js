/**
 * Google Sign-In 認證模組
 */
const Auth = {
  user: null,       // { email, name, token, role }
  tokenClient: null,

  init() {
    // 初始化 Google Identity Services
    if (typeof google === 'undefined' || !google.accounts) {
      // GIS 還沒載入，等一下再試
      setTimeout(() => this.init(), 500);
      return;
    }

    google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: (response) => this.handleCredentialResponse(response),
      auto_select: true,
    });

    google.accounts.id.renderButton(
      document.getElementById('googleSignInBtn'),
      {
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        locale: 'zh-TW',
        width: 300,
      }
    );

    // 嘗試自動登入
    google.accounts.id.prompt();
  },

  async handleCredentialResponse(response) {
    const idToken = response.credential;

    try {
      UI.showLoading(true);

      // 解析 JWT 取得基本資訊（不驗證，驗證由 GAS 做）
      const payload = JSON.parse(atob(idToken.split('.')[1]));
      const email = payload.email;
      const name = payload.name || email;

      // 呼叫 GAS API 驗證 + 取得角色
      const result = await API.call('auth', { token: idToken });

      if (result.success && result.isAuthorized) {
        this.user = {
          email: result.email,
          name: result.name || name,
          token: idToken,
          role: result.role,
        };

        this.onLoginSuccess();
      } else {
        UI.showLoading(false);
        UI.showToast(result.error || '您沒有存取權限，請聯繫管理員', 'error', 5000);
      }
    } catch (err) {
      UI.showLoading(false);
      console.error('登入失敗:', err);
      UI.showToast('登入失敗: ' + err.message, 'error');
    }
  },

  onLoginSuccess() {
    // 隱藏登入畫面，顯示主應用
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');

    // 更新使用者資訊顯示
    const badge = document.getElementById('userBadge');
    const roleLabels = { admin: '管理員', editor: '編輯者', viewer: '檢視者' };
    badge.innerHTML = `
      ${UI.escapeHtml(this.user.name)}
      <span class="role-badge role-${this.user.role}">${roleLabels[this.user.role] || '未知'}</span>
    `;

    // 套用角色權限
    UI.applyRoleVisibility(this.user.role);

    // 初始化應用程式
    CalendarApp.init();

    UI.showLoading(false);
    UI.log('登入成功: ' + this.user.email + ' (' + this.user.role + ')', 'success');
  },

  signOut() {
    google.accounts.id.disableAutoSelect();
    this.user = null;

    // 停止同步
    SyncManager.stop();

    // 切換畫面
    document.getElementById('appContainer').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');

    UI.showToast('已登出', 'info');
  },

  getToken() {
    return this.user ? this.user.token : null;
  },

  getRole() {
    return this.user ? this.user.role : null;
  },

  getEmail() {
    return this.user ? this.user.email : null;
  },

  isAdmin() {
    return this.user && this.user.role === 'admin';
  },

  isEditor() {
    return this.user && (this.user.role === 'admin' || this.user.role === 'editor');
  },
};
