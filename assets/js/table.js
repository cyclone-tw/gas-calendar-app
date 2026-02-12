/**
 * 週次表格模組 - 渲染行事曆預覽表格
 */
const Table = {
  init() {
    this.render();
    // 監聽事件更新
    EventStore.on('eventsUpdated', () => this.updateDisplay());
    EventStore.on('settingsUpdated', () => this.render());
  },

  render() {
    const tbody = document.getElementById('calendarBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const weeks = EventStore.generateWeeks();
    weeks.forEach(week => {
      const row = document.createElement('tr');
      row.dataset.weekStart = week.start;
      row.dataset.weekEnd = week.end;
      row.dataset.weekNum = week.num;

      // 週次
      const weekCell = document.createElement('td');
      weekCell.className = 'week-col';
      weekCell.textContent = week.num;
      row.appendChild(weekCell);

      // 日期區間
      const dateCell = document.createElement('td');
      dateCell.className = 'date-col';
      dateCell.innerHTML = `${week.start}<br>${week.end}`;
      row.appendChild(dateCell);

      // 活動內容
      const actCell = document.createElement('td');
      actCell.className = 'activity-cell';
      actCell.dataset.week = week.num;
      row.appendChild(actCell);

      // 備註
      const noteCell = document.createElement('td');
      noteCell.className = 'note-cell';
      noteCell.dataset.week = week.num;
      row.appendChild(noteCell);

      tbody.appendChild(row);
    });

    this.updateDisplay();
  },

  updateDisplay() {
    // 清空所有活動格
    document.querySelectorAll('.activity-cell, .note-cell').forEach(cell => {
      cell.innerHTML = '';
    });

    const events = EventStore.getAll();
    const weekActivities = {};
    const weekNotes = {};

    // 將事件分組到對應週次
    events.forEach(event => {
      const rows = document.querySelectorAll('#calendarBody tr');
      for (const row of rows) {
        const ws = row.dataset.weekStart;
        const we = row.dataset.weekEnd;
        const evStart = new Date(event.startDate);
        const weekStart = new Date(ws);
        const weekEnd = new Date(we);

        if (evStart >= weekStart && evStart <= weekEnd) {
          const wn = row.dataset.weekNum;
          if (!weekActivities[wn]) weekActivities[wn] = [];
          if (!weekNotes[wn]) weekNotes[wn] = [];
          weekActivities[wn].push(event);
          if (event.notes) weekNotes[wn].push({ id: event.id, text: event.notes, label: event.content });
          break;
        }
      }
    });

    const isEditor = Auth.isEditor();

    // 渲染每個週次的活動
    Object.keys(weekActivities).forEach(weekNum => {
      const actCell = document.querySelector(`.activity-cell[data-week="${weekNum}"]`);
      const noteCell = document.querySelector(`.note-cell[data-week="${weekNum}"]`);
      if (!actCell) return;

      // 排序
      weekActivities[weekNum].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

      weekActivities[weekNum].forEach(event => {
        const div = document.createElement('div');
        div.className = 'activity-item';
        div.dataset.activityId = event.id;

        const textSpan = document.createElement('span');
        textSpan.className = 'activity-text';
        textSpan.textContent = `${EventStore.formatActivityDate(event.startDate, event.startTime, event.endTime)} ${event.content}`;
        div.appendChild(textSpan);

        if (isEditor) {
          const actions = document.createElement('span');
          actions.className = 'activity-actions';

          const editBtn = document.createElement('button');
          editBtn.className = 'edit-btn';
          editBtn.textContent = '編輯';
          editBtn.onclick = (e) => { e.stopPropagation(); Form.startEdit(event.id); };

          const delBtn = document.createElement('button');
          delBtn.className = 'delete-btn';
          delBtn.textContent = '刪除';
          delBtn.onclick = (e) => { e.stopPropagation(); Form.deleteActivity(event.id); };

          actions.appendChild(editBtn);
          actions.appendChild(delBtn);
          div.appendChild(actions);
        }

        actCell.appendChild(div);
      });

      // 備註
      if (weekNotes[weekNum]) {
        weekNotes[weekNum].forEach(note => {
          const div = document.createElement('div');
          div.className = 'note-item';
          div.innerHTML = `<span class="note-label">${UI.escapeHtml(note.label)}：</span>${UI.escapeHtml(note.text)}`;
          noteCell.appendChild(div);
        });
      }
    });
  },
};
