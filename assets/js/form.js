/**
 * 活動表單模組 - 新增/編輯/刪除
 */
const Form = {
  editingId: null,
  recognition: null,
  currentVoiceInput: null,

  init() {
    // 初始化日期預設值
    const today = EventStore.formatDate(new Date());
    document.getElementById('startDate').value = today;
    document.getElementById('endDate').value = today;

    // 開始日期變更時同步結束日期
    document.getElementById('startDate').addEventListener('change', function () {
      const endDate = document.getElementById('endDate');
      if (!endDate.value || endDate.value < this.value) {
        endDate.value = this.value;
      }
    });

    // 初始化語音辨識
    this.initSpeechRecognition();
  },

  // ===== 新增活動 =====
  async save() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const content = document.getElementById('activityContent').value.trim();
    const notes = document.getElementById('notes').value.trim();

    if (!startDate || !content) {
      UI.showToast('請填寫開始日期和活動內容', 'error');
      return;
    }

    if (endDate && endDate < startDate) {
      UI.showToast('結束日期不能早於開始日期', 'error');
      return;
    }

    // 檢查日期範圍
    const semStart = new Date(EventStore.settings.semesterStart);
    const semEnd = new Date(EventStore.settings.semesterEnd);
    const actStart = new Date(startDate);
    if (actStart < semStart || actStart > semEnd) {
      UI.showToast('活動日期超出學期範圍', 'error');
      return;
    }

    const eventData = {
      startDate,
      endDate: endDate || startDate,
      content,
      notes,
    };

    try {
      UI.showLoader(true);

      if (this.editingId) {
        // 更新模式
        const result = await API.updateEvent(this.editingId, eventData);
        if (result.success) {
          UI.showToast('活動更新成功', 'success');
          UI.log('更新活動: ' + content, 'success');
          this.cancelEdit();
        } else {
          UI.showToast('更新失敗: ' + (result.error || ''), 'error');
        }
      } else {
        // 新增模式
        const result = await API.createEvent(eventData);
        if (result.success) {
          UI.showToast('活動新增成功', 'success');
          UI.log('新增活動: ' + content, 'success');
          this.clear();
        } else {
          UI.showToast('新增失敗: ' + (result.error || ''), 'error');
        }
      }

      // 強制同步以取得最新資料
      await SyncManager.forceSync();
    } catch (err) {
      UI.showToast('操作失敗: ' + err.message, 'error');
    } finally {
      UI.showLoader(false);
    }
  },

  // ===== 進入編輯模式 =====
  startEdit(id) {
    const event = EventStore.getById(id);
    if (!event) {
      UI.showToast('找不到活動', 'error');
      return;
    }

    // 檢查權限
    if (!Auth.isAdmin() && event.createdBy && event.createdBy !== Auth.getEmail()) {
      UI.showToast('您只能編輯自己建立的活動', 'error');
      return;
    }

    this.editingId = id;
    document.getElementById('editEventId').value = id;
    document.getElementById('startDate').value = event.startDate;
    document.getElementById('endDate').value = event.endDate;
    document.getElementById('activityContent').value = event.content;
    document.getElementById('notes').value = event.notes || '';

    document.getElementById('formTitle').textContent = '編輯活動';
    document.getElementById('btnSaveEvent').textContent = '更新活動';
    document.getElementById('btnCancelEdit').classList.remove('hidden');

    // 滾動到表單
    document.getElementById('eventFormPanel').scrollIntoView({ behavior: 'smooth' });
  },

  cancelEdit() {
    this.editingId = null;
    document.getElementById('editEventId').value = '';
    document.getElementById('formTitle').textContent = '新增活動';
    document.getElementById('btnSaveEvent').textContent = '新增活動';
    document.getElementById('btnCancelEdit').classList.add('hidden');
    this.clear();
  },

  clear() {
    const today = EventStore.formatDate(new Date());
    document.getElementById('startDate').value = today;
    document.getElementById('endDate').value = today;
    document.getElementById('activityContent').value = '';
    document.getElementById('notes').value = '';
  },

  // ===== Modal 編輯（從 FullCalendar 點擊）=====
  openEditModal(id) {
    const event = EventStore.getById(id);
    if (!event) return;

    document.getElementById('editStartDate').value = event.startDate;
    document.getElementById('editEndDate').value = event.endDate;
    document.getElementById('editActivityContent').value = event.content;
    document.getElementById('editNotes').value = event.notes || '';
    document.getElementById('editModal').dataset.eventId = id;

    // 權限控制
    const canEdit = Auth.isAdmin() || (Auth.isEditor() && (!event.createdBy || event.createdBy === Auth.getEmail()));
    const canDelete = canEdit;

    document.getElementById('editDeleteBtn').classList.toggle('hidden', !canDelete);
    document.querySelectorAll('#editModal .btn-primary').forEach(btn => {
      btn.classList.toggle('hidden', !canEdit);
    });

    UI.openModal('editModal');
  },

  async saveFromModal() {
    const id = document.getElementById('editModal').dataset.eventId;
    const eventData = {
      startDate: document.getElementById('editStartDate').value,
      endDate: document.getElementById('editEndDate').value,
      content: document.getElementById('editActivityContent').value.trim(),
      notes: document.getElementById('editNotes').value.trim(),
    };

    if (!eventData.startDate || !eventData.content) {
      UI.showToast('請填寫必要欄位', 'error');
      return;
    }

    try {
      UI.showLoader(true);
      const result = await API.updateEvent(id, eventData);
      if (result.success) {
        UI.showToast('活動更新成功', 'success');
        UI.closeModal('editModal');
        await SyncManager.forceSync();
      } else {
        UI.showToast('更新失敗: ' + (result.error || ''), 'error');
      }
    } catch (err) {
      UI.showToast('更新失敗: ' + err.message, 'error');
    } finally {
      UI.showLoader(false);
    }
  },

  async deleteFromModal() {
    const id = document.getElementById('editModal').dataset.eventId;
    const event = EventStore.getById(id);
    const confirmed = await UI.confirm('刪除活動', `確定要刪除「${event ? event.content : ''}」嗎？`);
    if (!confirmed) return;

    try {
      UI.showLoader(true);
      const result = await API.deleteEvent(id);
      if (result.success) {
        UI.showToast('活動已刪除', 'success');
        UI.closeModal('editModal');
        await SyncManager.forceSync();
      } else {
        UI.showToast('刪除失敗: ' + (result.error || ''), 'error');
      }
    } catch (err) {
      UI.showToast('刪除失敗: ' + err.message, 'error');
    } finally {
      UI.showLoader(false);
    }
  },

  // ===== 從表格刪除 =====
  async deleteActivity(id) {
    const event = EventStore.getById(id);
    const confirmed = await UI.confirm('刪除活動', `確定要刪除「${event ? event.content : ''}」嗎？`);
    if (!confirmed) return;

    try {
      UI.showLoader(true);
      const result = await API.deleteEvent(id);
      if (result.success) {
        UI.showToast('活動已刪除', 'success');
        await SyncManager.forceSync();
      } else {
        UI.showToast('刪除失敗: ' + (result.error || ''), 'error');
      }
    } catch (err) {
      UI.showToast('刪除失敗: ' + err.message, 'error');
    } finally {
      UI.showLoader(false);
    }
  },

  // ===== 語音輸入 =====
  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'zh-TW';
    this.recognition.continuous = false;
    this.recognition.interimResults = false;

    this.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (this.currentVoiceInput) {
        const el = document.getElementById(this.currentVoiceInput);
        el.value += transcript;
      }
    };

    this.recognition.onend = () => {
      document.querySelectorAll('.voice-btn').forEach(btn => btn.classList.remove('recording'));
    };
  },

  toggleVoice(inputId) {
    if (!this.recognition) {
      UI.showToast('您的瀏覽器不支援語音輸入', 'error');
      return;
    }

    const btn = event.target.closest('.voice-btn');
    if (btn && btn.classList.contains('recording')) {
      this.recognition.stop();
    } else {
      this.currentVoiceInput = inputId;
      this.recognition.start();
      if (btn) btn.classList.add('recording');
    }
  },
};
