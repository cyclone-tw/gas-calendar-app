/**
 * 匯出模組 - Excel / PDF / Word
 */
const Export = {
  getTitle() {
    return document.getElementById('exportTitle')?.value || EventStore.settings.calendarTitle || '行事曆';
  },

  getTableData() {
    const events = EventStore.getAll();
    const weeks = EventStore.generateWeeks();
    const data = [];

    weeks.forEach(week => {
      const weekEvents = events.filter(e => {
        const evStart = new Date(e.startDate);
        return evStart >= week.startDate && evStart <= week.endDate;
      }).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

      const activities = weekEvents.length > 0
        ? weekEvents.map(e => `${EventStore.formatActivityDate(e.startDate, e.startTime, e.endTime)} ${e.content}`).join('\n')
        : '';
      const notes = weekEvents.length > 0
        ? weekEvents.map(e => e.notes).filter(Boolean).join('\n')
        : '';

      data.push({
        week: week.num,
        dateRange: `${week.start}~${week.end}`,
        activities,
        notes,
      });
    });

    return data;
  },

  // ===== Excel 匯出 =====
  toExcel() {
    const title = this.getTitle();
    const timestamp = new Date().toLocaleString('zh-TW');
    const data = this.getTableData();

    const wsData = [];
    wsData.push([title]);
    wsData.push(['匯出時間：' + timestamp]);
    wsData.push([]);
    wsData.push(['週次', '日期區間', '活動內容', '備註']);

    data.forEach(row => {
      wsData.push([row.week, row.dateRange, row.activities, row.notes]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 8 }, { wch: 20 }, { wch: 50 }, { wch: 30 }];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    ];
    // 設定行高：標題列較高，資料列依內容行數動態調整
    const rows = [];
    rows[0] = { hpt: 30 };  // 標題
    rows[1] = { hpt: 20 };  // 時間戳
    rows[2] = { hpt: 15 };  // 空行
    rows[3] = { hpt: 25 };  // 表頭
    data.forEach((row, i) => {
      const lines = Math.max(
        (row.activities.match(/\n/g) || []).length + 1,
        (row.notes.match(/\n/g) || []).length + 1,
        1
      );
      rows[i + 4] = { hpt: Math.max(25, lines * 20) };
    });
    ws['!rows'] = rows;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '行事曆');
    XLSX.writeFile(wb, `${title}_${new Date().toLocaleDateString('zh-TW').replace(/\//g, '-')}.xlsx`);

    UI.showToast('Excel 匯出成功', 'success');
  },

  // ===== PDF 匯出（列印）=====
  toPDF() {
    const title = this.getTitle();
    const timestamp = new Date().toLocaleString('zh-TW');
    const data = this.getTableData();

    let rows = '';
    data.forEach(row => {
      rows += `<tr>
        <td class="week-col">${row.week}</td>
        <td class="date-col">${UI.escapeHtml(row.dateRange)}</td>
        <td class="activity-col">${UI.escapeHtml(row.activities).replace(/\n/g, '<br>')}</td>
        <td class="note-col">${UI.escapeHtml(row.notes).replace(/\n/g, '<br>')}</td>
      </tr>`;
    });

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>
        @page { size: A4 portrait; margin: 15mm; }
        body { font-family: 'Microsoft JhengHei', Arial, sans-serif; margin: 0; }
        h1 { text-align: center; font-size: 24px; margin-bottom: 10px; }
        .ts { text-align: center; font-size: 12px; color: #666; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #000; padding: 8px 10px; vertical-align: top; word-wrap: break-word; }
        th { background: #f0f0f0; text-align: center; font-weight: bold; padding: 10px; }
        .week-col { width: 8%; text-align: center; }
        .date-col { width: 20%; font-size: 10px; }
        .activity-col { width: 42%; }
        .note-col { width: 30%; }
        td { white-space: pre-wrap; line-height: 1.8; }
      </style></head><body>
      <h1>${UI.escapeHtml(title)}</h1>
      <div class="ts">匯出時間：${timestamp}</div>
      <table><thead><tr>
        <th class="week-col">週次</th><th class="date-col">日期區間</th>
        <th class="activity-col">活動內容</th><th class="note-col">備註</th>
      </tr></thead><tbody>${rows}</tbody></table></body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.onload = () => {
      win.print();
      win.onafterprint = () => win.close();
    };

    UI.showToast('正在準備 PDF 列印...', 'info');
  },

  // ===== Word 匯出 =====
  toWord() {
    if (typeof docx === 'undefined') {
      UI.showToast('Word 函式庫載入中，請稍後再試', 'info');
      return;
    }

    const title = this.getTitle();
    const timestamp = new Date().toLocaleString('zh-TW');
    const data = this.getTableData();

    try {
      const { Document, Packer, Paragraph, TextRun, Table: DocTable, TableCell, TableRow, WidthType, AlignmentType, TableCellMargin } = docx;

      const doc = new Document({
        sections: [{
          properties: {
            page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
          },
          children: [
            new Paragraph({
              children: [new TextRun({ text: title, bold: true, size: 48 })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
            }),
            new Paragraph({
              children: [new TextRun({ text: '匯出時間：' + timestamp, size: 20, color: '666666' })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),
            new DocTable({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: ['週次', '日期區間', '活動內容', '備註'].map((h, i) =>
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 22 })], alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 } })],
                      width: { size: [8, 20, 42, 30][i], type: WidthType.PERCENTAGE },
                      shading: { fill: 'EEEEEE' },
                      margins: { top: 80, bottom: 80, left: 120, right: 120 },
                    })
                  ),
                }),
                ...data.map(row =>
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({ text: String(row.week), alignment: AlignmentType.CENTER, spacing: { before: 40, after: 40 } })],
                        margins: { top: 60, bottom: 60, left: 80, right: 80 },
                      }),
                      new TableCell({
                        children: [new Paragraph({ text: row.dateRange, spacing: { before: 40, after: 40 } })],
                        margins: { top: 60, bottom: 60, left: 120, right: 120 },
                      }),
                      new TableCell({
                        children: row.activities.split('\n').map(a => new Paragraph({ text: a, spacing: { before: 20, after: 120 } })),
                        margins: { top: 60, bottom: 60, left: 120, right: 120 },
                      }),
                      new TableCell({
                        children: row.notes ? row.notes.split('\n').map(n => new Paragraph({ text: n, spacing: { before: 20, after: 120 } })) : [new Paragraph('')],
                        margins: { top: 60, bottom: 60, left: 120, right: 120 },
                      }),
                    ],
                  })
                ),
              ],
            }),
          ],
        }],
      });

      Packer.toBlob(doc).then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}_${new Date().toLocaleDateString('zh-TW').replace(/\//g, '-')}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        UI.showToast('Word 匯出成功', 'success');
      });
    } catch (err) {
      UI.showToast('Word 匯出失敗: ' + err.message, 'error');
    }
  },
};
