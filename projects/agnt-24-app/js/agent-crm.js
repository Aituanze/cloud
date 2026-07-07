// CRM Kanban-воронка
const STAGES = [
  { id: 'new',       label: 'Новый лид',  color: '#2d6be4' },
  { id: 'contacted', label: 'Контакт',    color: '#e07b2a' },
  { id: 'showing',   label: 'Показ',      color: '#7055c0' },
  { id: 'deposit',   label: 'Задаток',    color: '#15966b' },
  { id: 'deal',      label: 'Сделка',     color: '#15966b' },
  { id: 'lost',      label: 'Отказ',      color: '#9fa6b2' },
];

const AgentCrm = {
  _profile: null,
  _leads:   [],

  // ── localStorage helpers ─────────────────
  _getNotes(id)  {
    try { return JSON.parse(localStorage.getItem(`24s_notes_${id}`) || '[]'); } catch { return []; }
  },
  _saveNotes(id, notes) { localStorage.setItem(`24s_notes_${id}`, JSON.stringify(notes)); },
  _getFollowUp(id) { return localStorage.getItem(`24s_fu_${id}`); },
  _saveFollowUp(id, days) {
    const d = new Date(); d.setDate(d.getDate() + days);
    localStorage.setItem(`24s_fu_${id}`, d.toISOString()); return d;
  },

  // ── «не звонили N дней» ──────────────────
  _daysSinceContact(lead) {
    const notes = this._getNotes(lead.id);
    const lastTs = notes.length ? notes[0].ts : lead.created_at; // notes.unshift — [0] самая свежая
    return Math.floor((Date.now() - new Date(lastTs).getTime()) / 86400000);
  },
  _isStale(lead) {
    if (lead.stage === 'deal' || lead.stage === 'lost') return false;
    return this._daysSinceContact(lead) >= 3;
  },
  _pluralDays(n) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 14) return 'дней';
    if (mod10 === 1) return 'день';
    if (mod10 >= 2 && mod10 <= 4) return 'дня';
    return 'дней';
  },

  init(profile) {
    this._profile = profile;
    document.getElementById('leadDetailBack')
      .addEventListener('click', () => slideBack());
  },

  // Вызывается из switchTab — только загрузка данных, без навигации
  async renderBoard() {
    this._leads = await Sb.getAgentLeads(this._profile.id);
    this._renderBoard();
    this._updateBadge();
  },

  _updateBadge() {
    const newCount = this._leads.filter(l => l.stage === 'new').length;
    const badge = document.getElementById('crmBadge');
    if (!badge) return;
    badge.textContent = newCount > 0 ? newCount : '';
    badge.style.display = newCount > 0 ? 'flex' : 'none';
  },

  _renderBoard() {
    const board = document.getElementById('crmBoard');
    board.innerHTML = STAGES.map(s => {
      const leads = this._leads
        .filter(l => l.stage === s.id)
        .sort((a, b) => {
          const aStale = this._isStale(a), bStale = this._isStale(b);
          if (aStale !== bStale) return aStale ? -1 : 1;
          if (aStale) return this._daysSinceContact(b) - this._daysSinceContact(a);
          return new Date(b.created_at) - new Date(a.created_at);
        });
      return `<div class="crm-col" data-stage="${s.id}">
        <div class="crm-col-title" style="color:${s.color}">
          ${s.label}<span class="crm-col-count">${leads.length}</span>
        </div>
        ${leads.map(l => this._cardHTML(l)).join('')}
      </div>`;
    }).join('');

    board.querySelectorAll('.lead-card').forEach(card => {
      card.addEventListener('click', () => {
        const lead = this._leads.find(l => l.id === card.dataset.id);
        if (lead) this._openDetail(lead);
      });
    });
    board.querySelectorAll('.lead-card-call').forEach(btn => {
      btn.addEventListener('click', e => e.stopPropagation());
    });
  },

  _cardHTML(l) {
    const addr  = l.properties?.address || '—';
    const phone = l.buyer_phone || l.buyer_profiles?.phone || '—';
    const time  = new Date(l.created_at).toLocaleDateString('ru', { day:'numeric', month:'short' });
    const stale = this._isStale(l);
    const warnHtml = stale
      ? `<div class="lead-card-warn">
           <span>⚠️ Не звонили ${this._daysSinceContact(l)} ${this._pluralDays(this._daysSinceContact(l))}</span>
           <a class="lead-card-call" href="tel:${phone.replace(/\D/g,'')}">📞</a>
         </div>`
      : '';
    return `<div class="lead-card${stale ? ' stale' : ''}" data-id="${l.id}">
      <div class="lead-card-addr">${addr}</div>
      <div class="lead-card-phone">${phone}</div>
      <div class="lead-card-time">${time}</div>
      ${warnHtml}
    </div>`;
  },

  _openDetail(lead) {
    const addr   = lead.properties?.address   || '—';
    const price  = lead.properties?.price_label || '';
    const photo  = lead.properties?.photos?.[0] || '';
    const phone  = lead.buyer_phone || lead.buyer_profiles?.phone || '—';
    const stageIdx = STAGES.findIndex(s => s.id === lead.stage);

    document.getElementById('leadDetailTitle').textContent = addr;

    const stageButtons = STAGES.slice(0, 5).map((s, i) => {
      const cls = i < stageIdx ? 'past' : (i === stageIdx ? 'active' : '');
      return `<button class="stage-btn ${cls}" data-stage="${s.id}">${s.label}</button>`;
    }).join('');

    const photoHtml = photo
      ? `<img src="${photo}" style="width:100%;height:140px;object-fit:cover;border-radius:14px;margin-bottom:16px">`
      : '';

    const fuDate = this._getFollowUp(lead.id);
    const fuLabel = fuDate ? (() => {
      const diff = Math.ceil((new Date(fuDate) - Date.now()) / 86400000);
      return diff <= 0 ? '⚠️ Просрочено' : `📅 ${new Date(fuDate).toLocaleDateString('ru', {day:'numeric',month:'short'})}`;
    })() : '';

    document.getElementById('leadDetailContent').innerHTML = `
      ${photoHtml}
      <div style="font-size:26px;font-weight:700;color:var(--ink);letter-spacing:-0.5px;margin-bottom:2px">${price} <span style="font-size:16px;font-weight:600">₸</span></div>
      <div style="font-size:13px;color:var(--ink2);margin-bottom:20px">${addr}</div>

      <div class="lead-section-label">Этап сделки</div>
      <div class="lead-stage-row">${stageButtons}</div>

      <div class="lead-section-label">Покупатель</div>
      <div style="font-size:17px;font-weight:700;color:var(--ink);margin-bottom:12px">${phone}</div>

      <div style="display:flex;gap:10px;margin-bottom:20px">
        <a href="tel:${phone.replace(/\D/g,'')}"
           style="flex:1;display:block;text-align:center;padding:14px;background:var(--ink);color:white;border-radius:14px;font-weight:700;text-decoration:none;font-size:14px">
          Позвонить
        </a>
        <a href="https://wa.me/${phone.replace(/\D/g,'')}" target="_blank"
           style="flex:1;display:block;text-align:center;padding:14px;background:#25D366;color:white;border-radius:14px;font-weight:700;text-decoration:none;font-size:14px">
          WhatsApp
        </a>
      </div>

      <div class="lead-section-label">Напомнить</div>
      <div class="fu-row">
        <button class="fu-btn" data-days="1">Завтра</button>
        <button class="fu-btn" data-days="3">3 дня</button>
        <button class="fu-btn" data-days="7">Неделю</button>
      </div>
      <div class="fu-status" id="fuStatus">${fuLabel}</div>

      <div class="lead-section-label">Заметки</div>
      <div class="lead-notes-list" id="notesList"></div>
      <div class="lead-note-input-row">
        <textarea id="noteInput" placeholder="Добавить заметку..." rows="2"></textarea>
        <button class="note-save-btn" id="noteSaveBtn">Сохранить</button>
      </div>
    `;

    this._renderNotes(lead.id);

    document.querySelectorAll('.stage-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (btn.classList.contains('active')) return;
        try {
          await Sb.updateLeadStage(lead.id, btn.dataset.stage, null);
        } catch (err) {
          console.error('updateLeadStage failed', err);
          App._toast('Не удалось сменить этап: ' + (err.message || 'ошибка сети'));
          return; // не трогаем lead.stage и не перерисовываем — реальный этап не изменился
        }
        lead.stage = btn.dataset.stage;
        this._renderBoard();
        this._openDetail(lead);
      });
    });

    document.querySelectorAll('.fu-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const days = parseInt(btn.dataset.days);
        const d = this._saveFollowUp(lead.id, days);
        document.getElementById('fuStatus').textContent =
          `📅 ${d.toLocaleDateString('ru', {day:'numeric',month:'short'})}`;
        document.querySelectorAll('.fu-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._updateBadge();
      });
    });

    document.getElementById('noteSaveBtn').addEventListener('click', () => {
      const input = document.getElementById('noteInput');
      const text = input.value.trim();
      if (!text) return;
      this._addNote(lead.id, text);
      input.value = '';
      this._renderNotes(lead.id);
    });

    // slideForward записывает tabBarVisible ДО скрытия
    slideForward('screen-crm', 'screen-lead-detail');
    document.getElementById('tabBar').classList.add('hidden');
  },

  _addNote(id, text) {
    const notes = this._getNotes(id);
    notes.unshift({ text, ts: new Date().toISOString() });
    this._saveNotes(id, notes);
  },

  _renderNotes(id) {
    const notes = this._getNotes(id);
    const el = document.getElementById('notesList');
    if (!el) return;
    if (!notes.length) { el.innerHTML = '<div class="note-empty">Нет заметок</div>'; return; }
    el.innerHTML = notes.map(n => {
      const d = new Date(n.ts).toLocaleDateString('ru', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      return `<div class="note-item"><div class="note-text">${n.text}</div><div class="note-ts">${d}</div></div>`;
    }).join('');
  },
};
