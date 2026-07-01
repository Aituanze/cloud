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

  init(profile) {
    this._profile = profile;
    document.getElementById('leadDetailBack')
      .addEventListener('click', () => slideBack('screen-lead-detail', 'screen-crm'));
  },

  async show() {
    this._leads = await Sb.getAgentLeads(this._profile.id);
    this._renderBoard();
    slideForward('screen-map', 'screen-crm');
    document.getElementById('tabBar').classList.add('hidden');
  },

  _renderBoard() {
    const board = document.getElementById('crmBoard');
    board.innerHTML = STAGES.map(s => {
      const leads = this._leads.filter(l => l.stage === s.id);
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
  },

  _cardHTML(l) {
    const addr  = l.properties?.address || '—';
    const phone = l.buyer_phone || l.buyer_profiles?.phone || '—';
    const time  = new Date(l.created_at).toLocaleDateString('ru', { day:'numeric', month:'short' });
    return `<div class="lead-card" data-id="${l.id}">
      <div class="lead-card-addr">${addr}</div>
      <div class="lead-card-phone">${phone}</div>
      <div class="lead-card-time">${time}</div>
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

    document.getElementById('leadDetailContent').innerHTML = `
      ${photoHtml}
      <div style="font-size:26px;font-weight:700;color:var(--ink);letter-spacing:-0.5px;margin-bottom:2px">${price} <span style="font-size:16px;font-weight:600">₸</span></div>
      <div style="font-size:13px;color:var(--ink2);margin-bottom:20px">${addr}</div>

      <div class="lead-section-label">Этап сделки</div>
      <div class="lead-stage-row">${stageButtons}</div>

      <div class="lead-section-label">Покупатель</div>
      <div style="font-size:17px;font-weight:700;color:var(--ink);margin-bottom:16px">${phone}</div>

      <div style="display:flex;gap:10px">
        <a href="tel:${phone.replace(/\D/g,'')}"
           style="flex:1;display:block;text-align:center;padding:14px;background:var(--ink);color:white;border-radius:14px;font-weight:700;text-decoration:none;font-size:14px">
          Позвонить
        </a>
        <a href="https://wa.me/${phone.replace(/\D/g,'')}" target="_blank"
           style="flex:1;display:block;text-align:center;padding:14px;background:#25D366;color:white;border-radius:14px;font-weight:700;text-decoration:none;font-size:14px">
          WhatsApp
        </a>
      </div>
    `;

    document.querySelectorAll('.stage-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (btn.classList.contains('active')) return;
        await Sb.updateLeadStage(lead.id, btn.dataset.stage, null);
        lead.stage = btn.dataset.stage;
        this._renderBoard();
        this._openDetail(lead);
      });
    });

    slideForward('screen-crm', 'screen-lead-detail');
  },
};
