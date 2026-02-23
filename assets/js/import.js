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
        const sheetName = wb.SheetNames.includes('匯入資料') ? '匯入資料' : wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { raw: false });
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
        startTime: '',
        endTime: '',
        content: '',
        notes: '',
      };

      for (const [key, val] of Object.entries(row)) {
        const k = key.trim().toLowerCase();
        if (['開始日期', 'startdate', '日期', '開始', 'start'].includes(k)) {
          mapped.startDate = this.normalizeImportDate(val);
        } else if (['結束日期', 'enddate', '結束', 'end'].includes(k)) {
          mapped.endDate = this.normalizeImportDate(val);
        } else if (['開始時間', 'starttime', '開始時段'].includes(k)) {
          mapped.startTime = this.normalizeTime(val);
        } else if (['結束時間', 'endtime', '結束時段'].includes(k)) {
          mapped.endTime = this.normalizeTime(val);
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

  normalizeTime(val) {
    if (!val) return '';
    const s = String(val).trim();
    const match = s.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return match[1].padStart(2, '0') + ':' + match[2];
      }
    }
    return '';
  },

  // ===== 預覽 =====
  showPreview() {
    const container = document.getElementById('importPreview');
    const table = document.getElementById('importPreviewTable');
    const summary = document.getElementById('importSummary');

    // 建立表格
    const preview = this.parsedData.slice(0, 5);
    let html = '<thead><tr><th>開始日期</th><th>結束日期</th><th>開始時間</th><th>結束時間</th><th>活動內容</th><th>備註</th></tr></thead><tbody>';
    preview.forEach(row => {
      html += `<tr>
        <td>${UI.escapeHtml(row.startDate)}</td>
        <td>${UI.escapeHtml(row.endDate)}</td>
        <td>${UI.escapeHtml(row.startTime || '')}</td>
        <td>${UI.escapeHtml(row.endTime || '')}</td>
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

  // ===== 範本選單 =====
  showTemplateMenu(e) {
    const existing = document.getElementById('templateMenu');
    if (existing) { existing.remove(); return; }

    const menu = document.createElement('div');
    menu.id = 'templateMenu';
    menu.className = 'template-menu';
    menu.innerHTML = `
      <button onclick="Import.downloadExcelTemplate(); Import.hideTemplateMenu();">Excel 範本 (.xlsx)</button>
      <button onclick="Import.downloadCSVTemplate(); Import.hideTemplateMenu();">CSV 範本 (.csv)</button>
    `;

    const rect = e.target.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = rect.left + 'px';
    document.body.appendChild(menu);

    setTimeout(() => {
      document.addEventListener('click', Import.hideTemplateMenu, { once: true });
    }, 0);
  },

  hideTemplateMenu() {
    const menu = document.getElementById('templateMenu');
    if (menu) menu.remove();
  },

  // ===== 範本下載 =====
  downloadCSVTemplate() {
    const headers = ['開始日期', '結束日期', '開始時間', '結束時間', '活動內容', '備註'];
    const examples = [
      ['2026-03-02', '', '', '', '開學日', '全校師生'],
      ['2026-03-10', '2026-03-11', '09:00', '12:00', '校外教學', '一、二年級參加'],
      ['2026-03-15', '', '', '', '補假', ''],
    ];

    const rows = [headers, ...examples];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '批次匯入範本.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  downloadExcelTemplate() {
    const wb = XLSX.utils.book_new();

    // === Sheet 1: 填寫說明 ===
    const instructions = [
      ['行事曆批次匯入 — 填寫說明'],
      [''],
      ['欄位名稱', '格式', '必填', '說明'],
      ['開始日期', 'YYYY-MM-DD', '是', '活動開始日期，例如 2026-03-02'],
      ['結束日期', 'YYYY-MM-DD', '否', '活動結束日期，留空則與開始日期相同'],
      ['開始時間', 'HH:MM', '否', '活動開始時間（24小時制），例如 09:00。留空表示全天活動'],
      ['結束時間', 'HH:MM', '否', '活動結束時間（24小時制），例如 17:00。留空表示全天活動'],
      ['活動內容', '文字', '是', '活動名稱或描述'],
      ['備註', '文字', '否', '補充說明'],
      [''],
      ['注意事項：'],
      ['1. 請在「匯入資料」工作表中填寫，從第 2 列開始（第 1 列為標頭，請勿修改）'],
      ['2. 範例資料（灰色列）可直接覆蓋或刪除'],
      ['3. 開始日期 和 活動內容 為必填欄位，缺少的列會被略過'],
      ['4. 日期格式請統一使用 YYYY-MM-DD（如 2026-03-02）'],
      ['5. 時間格式請使用 HH:MM 24小時制（如 09:00、14:30）'],
      ['6. 匯入後可在系統中個別編輯修改'],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(instructions);
    ws1['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 6 }, { wch: 50 }];
    ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    XLSX.utils.book_append_sheet(wb, ws1, '填寫說明');

    // === Sheet 2: 匯入資料 ===
    const data = [
      ['開始日期', '結束日期', '開始時間', '結束時間', '活動內容', '備註'],
      ['2026-03-02', '', '', '', '開學日', '全校師生'],
      ['2026-03-10', '2026-03-11', '09:00', '12:00', '校外教學', '一、二年級參加'],
      ['2026-03-15', '', '', '', '補假', ''],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(data);
    ws2['!cols'] = [
      { wch: 14 },
      { wch: 14 },
      { wch: 10 },
      { wch: 10 },
      { wch: 20 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, '匯入資料');

    XLSX.writeFile(wb, '批次匯入範本.xlsx');
  },
};
