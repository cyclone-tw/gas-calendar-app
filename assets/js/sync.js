/**
 * SyncManager - 即時輪詢同步管理器
 */
const SyncManager = {
  timer: null,
  isPolling: false,
  pollInterval: CONFIG.POLL_INTERVAL,
  errorCount: 0,
  maxErrors: 5,

  start() {
    this.stop();
    this.poll(); // 立即輪詢一次
    this.timer = setInterval(() => this.poll(), this.pollInterval);

    // 頁面可見性變化：前景 8 秒、背景 30 秒
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    UI.log('即時同步已啟動（每 ' + (this.pollInterval / 1000) + ' 秒）');
  },

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
  },

  _onVisibilityChange() {
    const self = SyncManager;
    self.stop();
    if (document.hidden) {
      self.pollInterval = CONFIG.POLL_INTERVAL_BACKGROUND;
    } else {
      self.pollInterval = CONFIG.POLL_INTERVAL;
      self.poll(); // 回到前景時立即輪詢
    }
    self.timer = setInterval(() => self.poll(), self.pollInterval);
  },

  async poll() {
    if (this.isPolling) return;
    this.isPolling = true;
    UI.setSyncStatus('syncing');

    try {
      const result = await API.checkForUpdates(EventStore.lastTimestamp);

      if (result.hasChanges && result.events) {
        EventStore.updateAll(result.events, result.timestamp);
        UI.setSyncStatus('synced');
        this.errorCount = 0;
      } else if (result.hasChanges === false) {
        UI.setSyncStatus('synced');
        this.errorCount = 0;
      } else if (result.error) {
        throw new Error(result.error);
      }
    } catch (err) {
      this.errorCount++;
      UI.setSyncStatus('error');
      if (this.errorCount >= this.maxErrors) {
        UI.log('同步錯誤過多，已暫停輪詢: ' + err.message, 'error');
        this.stop();
      }
    } finally {
      this.isPolling = false;
    }
  },

  // 寫入操作後強制同步
  async forceSync() {
    await this.poll();
  },
};
