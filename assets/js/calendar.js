/**
 * FullCalendar 整合模組
 */
const CalendarView = {
  instance: null,

  init() {
    const calendarEl = document.getElementById('fullcalendar');
    if (!calendarEl) return;

    this.instance = new FullCalendar.Calendar(calendarEl, {
      locale: 'zh-tw',
      initialView: 'dayGridMonth',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,listWeek',
      },
      buttonText: {
        today: '今天',
        month: '月',
        week: '週',
        list: '列表',
      },
      height: 'auto',
      editable: false,
      selectable: Auth.isEditor(),
      events: (info, successCallback) => {
        const events = EventStore.getAll().map(e => ({
          id: e.id,
          title: e.content,
          start: e.startDate,
          end: this.addOneDay(e.endDate),
          allDay: true,
          extendedProps: {
            notes: e.notes,
            createdBy: e.createdBy,
          },
        }));
        successCallback(events);
      },
      eventClick: (info) => {
        info.jsEvent.preventDefault();
        if (Auth.isEditor()) {
          Form.openEditModal(info.event.id);
        }
      },
      dateClick: (info) => {
        if (!Auth.isEditor()) return;
        document.getElementById('startDate').value = info.dateStr;
        document.getElementById('endDate').value = info.dateStr;
        document.getElementById('activityContent').focus();
        document.getElementById('eventFormPanel').scrollIntoView({ behavior: 'smooth' });
      },
      eventDidMount: (info) => {
        // 加入 tooltip
        if (info.event.extendedProps.notes) {
          info.el.title = info.event.extendedProps.notes;
        }
      },
    });

    this.instance.render();

    // 監聽事件更新
    EventStore.on('eventsUpdated', () => this.refresh());
  },

  refresh() {
    if (this.instance) {
      this.instance.refetchEvents();
    }
  },

  // FullCalendar 的全天事件 end 是 exclusive，需要 +1 天
  addOneDay(dateStr) {
    if (!dateStr) return dateStr;
    const d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    return EventStore.formatDate(d);
  },
};

/**
 * 應用程式主控制器
 */
const CalendarApp = {
  async init() {
    try {
      // 載入系統設定
      const settingsResult = await API.getSettings();
      if (settingsResult.success && settingsResult.settings) {
        EventStore.updateSettings(settingsResult.settings);

        // 更新 UI 顯示
        const display = document.getElementById('dateRangeDisplay');
        if (display) {
          display.innerHTML = `<strong>${EventStore.formatDateChinese(EventStore.settings.semesterStart)} 至 ${EventStore.formatDateChinese(EventStore.settings.semesterEnd)}</strong>`;
        }
        const titleInput = document.getElementById('exportTitle');
        if (titleInput) titleInput.value = EventStore.settings.calendarTitle;
      }

      // 載入事件資料
      await this.loadFromSheets();

      // 初始化各模組
      Form.init();
      Table.init();
      CalendarView.init();

      // 啟動即時同步
      SyncManager.start();

      UI.log('系統初始化完成', 'success');
    } catch (err) {
      UI.log('初始化失敗: ' + err.message, 'error');
      UI.showToast('系統初始化失敗', 'error');
    }
  },

  async loadFromSheets() {
    try {
      UI.showLoader(true);
      const result = await API.getEvents();
      if (result.success) {
        EventStore.updateAll(result.events, result.timestamp);
        UI.showToast(`已載入 ${result.events.length} 個活動`, 'success');
        UI.log(`載入 ${result.events.length} 個活動`, 'success');
      } else {
        UI.showToast('載入失敗: ' + (result.error || ''), 'error');
      }
    } catch (err) {
      UI.showToast('載入失敗: ' + err.message, 'error');
    } finally {
      UI.showLoader(false);
    }
  },

  async syncToSheets() {
    UI.showToast('資料已自動儲存到 Google Sheets', 'info');
  },

  refresh() {
    SyncManager.forceSync();
    UI.showToast('正在重新整理...', 'info');
  },

  async syncToGoogleCalendar() {
    if (!Auth.isAdmin()) {
      UI.showToast('只有管理員可以執行此操作', 'error');
      return;
    }

    const events = EventStore.getAll();
    const confirmed = await UI.confirm(
      '同步到 Google Calendar',
      `確定要將 ${events.length} 個活動同步到 Google Calendar 嗎？`
    );
    if (!confirmed) return;

    try {
      UI.showLoading(true);
      UI.log('開始同步到 Google Calendar...');
      const result = await API.syncToCalendar();
      UI.showLoading(false);

      if (result.success) {
        UI.showToast(result.message, 'success');
        UI.log(result.message, 'success');
        if (result.errors && result.errors.length > 0) {
          result.errors.forEach(e => UI.log(e, 'error'));
        }
      } else {
        UI.showToast('同步失敗: ' + (result.error || ''), 'error');
      }
    } catch (err) {
      UI.showLoading(false);
      UI.showToast('同步失敗: ' + err.message, 'error');
    }
  },
};
