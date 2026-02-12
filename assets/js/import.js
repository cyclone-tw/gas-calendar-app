/**
 * 批次匯入模組 - CSV / XLS / XLSX / Google Sheet
 */
const Import = {
  parsedData: [],
  currentTab: 'file',

  openModal() {
    this.parsedData = [];
    document.getElementById('importPreview').classList.add('hidden');
    document.getElementById('importFile').value = '';
    UI.openModal('importModal');
  },

  closeModal() {
    UI.closeModal('importModal');
    this.parsedData = [];
  },

  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('#importModal .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('fileImportTab').classList.toggle('hidden', tab !== 'file');
    document.getElementById('sheetImportTab').classList.toggle('hidden', tab !== 'sheet');
    event.target.classList.add('active');
  },

  // ===== 檔案匯入 =====
  handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'csv') {
      this.parseCSV(file);
    } else if (['xls', 'xlsx'].includes(ext)) {
      this.parseExcel(file);
    } else {
      UI.showToast('不支援的檔案格式，請使用 CSV、XLS 或 XLSX', 'error');
    }
  },

  parseCSV(file) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        this.parsedData = this.mapColumns(results.data);
        this.showPreview();
      },
      error: (err) => {
        UI.showToast('CSV 解析失敗: ' + err.message, 'error');
      },
    });
  },

  parseExcel(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { raw: false });
        this.parsedData = this.mapColumns(jsonData);
        this.showPreview();
      } catch (err) {
        UI.showToast('Excel 解析失敗: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  },

  // ===== 欄位對應 =====
  mapColumns(rows) {
    return rows.map(row => {
      const mapped = {
        startDate: '',
        endDate: '',
        content: '',
        notes: '',
      };

      for (const [key, val] of Object.entries(row)) {
        const k = key.trim().toLowerCase();
        if (['開始日期', 'startdate', '日期', '開始', 'start'].includes(k)) {
          mapped.startDate = this.normalizeImportDate(val);
        } else if (['結束日期', 'enddate', '結束', 'end'].includes(k)) {
          mapped.endDate = this.normalizeImportDate(val);
        } else if (['活動內容', 'content', '活動', '內容', 'title', '名稱'].includes(k)) {
          mapped.content = String(val || '').trim();
        } else if (['備註', 'notes', 'note', '說明', 'description'].includes(k)) {
          mapped.notes = String(val || '').trim();
        }
      }

      if (!mapped.endDate) mapped.endDate = mapped.startDate;
      return mapped;
    }).filter(r => r.startDate && r.content);
  },

  normalizeImportDate(val) {
    if (!val) return '';
    if (val instanceof Date) {
      return EventStore.formatDate(val);
    }
    const s = String(val).trim();
    // 嘗試解析各種格式
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return EventStore.formatDate(d);
    }
    // 嘗試 YYYY/MM/DD
    const parts = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (parts) {
      return `${parts[1]}-${parts[2].padStart(2, '0')}-${parts[3].padStart(2, '0')}`;
    }
    return s;
  },

  // ===== 預覽 =====
  showPreview() {
    const container = document.getElementById('importPreview');
    const table = document.getElementById('importPreviewTable');
    const summary = document.getElementById('importSummary');

    // 建立表格
    const preview = this.parsedData.slice(0, 5);
    let html = '<thead><tr><th>開始日期</th><th>結束日期</th><th>活動內容</th><th>備註</th></tr></thead><tbody>';
    preview.forEach(row => {
      html += `<tr>
        <td>${UI.escapeHtml(row.startDate)}</td>
        <td>${UI.escapeHtml(row.endDate)}</td>
        <td>${UI.escapeHtml(row.content)}</td>
        <td>${UI.escapeHtml(row.notes)}</td>
      </tr>`;
    });
    html += '</tbody>';
    table.innerHTML = html;

    summary.textContent = `共 ${this.parsedData.length} 筆資料${this.parsedData.length > 5 ? '（顯示前 5 筆）' : ''}`;
    container.classList.remove('hidden');
  },

  // ===== 確認匯入 =====
  async confirmImport() {
    if (this.parsedData.length === 0) {
      UI.showToast('沒有資料可匯入', 'error');
      return;
    }

    try {
      UI.showLoading(true);
      const result = await API.batchImport(this.parsedData);
      UI.showLoading(false);

      if (result.success) {
        UI.showToast(result.message || `成功匯入 ${result.imported || this.parsedData.length} 筆`, 'success');
        UI.log('批次匯入: ' + (result.message || ''), 'success');
        this.closeModal();
        await SyncManager.forceSync();
      } else {
        UI.showToast('匯入失敗: ' + (result.error || ''), 'error');
      }
    } catch (err) {
      UI.showLoading(false);
      UI.showToast('匯入失敗: ' + err.message, 'error');
    }
  },

  cancelImport() {
    this.parsedData = [];
    document.getElementById('importPreview').classList.add('hidden');
    document.getElementById('importFile').value = '';
  },

  // ===== Google Sheet 匯入 =====
  async fromGoogleSheet() {
    const url = document.getElementById('importSheetUrl').value.trim();
    if (!url) {
      UI.showToast('請輸入 Google Sheet URL', 'error');
      return;
    }

    // 提取 Sheet ID
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      UI.showToast('無效的 Google Sheet URL', 'error');
      return;
    }

    try {
      UI.showLoading(true);
      const result = await API.call('importFromSheet', { sheetId: match[1] });
      UI.showLoading(false);

      if (result.success) {
        UI.showToast(result.message, 'success');
        this.closeModal();
        await SyncManager.forceSync();
      } else {
        UI.showToast('匯入失敗: ' + (result.error || ''), 'error');
      }
    } catch (err) {
      UI.showLoading(false);
      UI.showToast('匯入失敗: ' + err.message, 'error');
    }
  },

  // ===== 拖放支援 =====
  initDropzone() {
    const zone = document.getElementById('fileDropzone');
    if (!zone) return;

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        this.handleFile({ target: { files: e.dataTransfer.files } });
      }
    });
  },
};
