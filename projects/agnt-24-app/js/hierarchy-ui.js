// Иерархия агентств: superadmin создаёт агентства → admin (руководитель)
// приглашает МОПов → mop приглашает агентов. + KPI-дашборд команды.

const ROLE_LABEL = { superadmin: 'Супер-админ', admin: 'Руководитель', mop: 'МОП', agent: 'Агент' };

const InviteFlow = {
  _invite: null,
  _token: null,

  // Вызывается на загрузке страницы, до проверки сессии — приглашённый ещё не залогинен
  async checkUrl() {
    const params = new URLSearchParams(location.search);
    const token = params.get('invite');
    if (!token) return false;
    this._token = token;
    await this._show(token);
    return true;
  },

  async _show(token) {
    document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.classList.add('slide-below'); });
    const screen = document.getElementById('screen-invite-accept');
    screen.classList.remove('slide-below');
    screen.classList.add('active');
    document.getElementById('tabBar').classList.add('hidden');

    try {
      const inv = await Sb.getInviteByToken(token);
      if (!inv || inv.status !== 'pending') {
        document.getElementById('inviteTitle').textContent = 'Приглашение недействительно';
        document.getElementById('inviteError').style.display = 'block';
        document.getElementById('inviteError').textContent = 'Ссылка уже использована или устарела';
        return;
      }
      this._invite = inv;
      document.getElementById('inviteTitle').textContent =
        `${inv.agency_name} приглашает вас как «${ROLE_LABEL[inv.role] || inv.role}»`;
      document.getElementById('inviteTagline').textContent = inv.email;
      document.getElementById('inviteForm').style.display = '';
    } catch (err) {
      document.getElementById('inviteTitle').textContent = 'Приглашение не найдено';
      console.error('checkUrl invite', err);
    }
  },

  bind() {
    document.getElementById('inviteSubmit')?.addEventListener('click', async () => {
      const name  = document.getElementById('inviteName').value.trim();
      const phone = document.getElementById('invitePhone').value.trim();
      const pass  = document.getElementById('invitePassword').value;
      const errEl = document.getElementById('inviteError');
      errEl.style.display = 'none';
      if (!name || pass.length < 6) {
        errEl.textContent = 'Введите имя и пароль (мин. 6 символов)';
        errEl.style.display = 'block';
        return;
      }
      const btn = document.getElementById('inviteSubmit');
      btn.textContent = 'Регистрируем...'; btn.disabled = true;
      try {
        let uid;
        const { data: su, error: suErr } = await Sb.auth.signUp({ email: this._invite.email, password: pass });
        if (suErr) throw suErr;
        uid = su.user?.id;
        if (!su.session) {
          const { data: si, error: siErr } = await Sb.auth.signInWithPassword({ email: this._invite.email, password: pass });
          if (siErr) throw new Error('Включи «Confirm email» OFF в Supabase → Auth → Providers → Email');
          uid = si.user.id;
        }
        await Sb.acceptInvite(this._token, name, phone);
        location.href = location.pathname; // очищаем ?invite= из URL
      } catch (err) {
        errEl.textContent = err.message || 'Ошибка регистрации';
        errEl.style.display = 'block';
        btn.textContent = 'Зарегистрироваться'; btn.disabled = false;
      }
    });
  },
};

const HierarchyUI = {
  _currentAgencyId: null, // для superadmin, когда открыт список агентств
  _statsEditingId: null,

  init() {
    document.getElementById('agenciesBack')?.addEventListener('click', () => slideBack());
    document.getElementById('agencyNewBack')?.addEventListener('click', () => slideBack());
    document.getElementById('teamBack')?.addEventListener('click', () => slideBack());
    document.getElementById('inviteNewBack')?.addEventListener('click', () => slideBack());
    document.getElementById('agentStatsBack')?.addEventListener('click', () => slideBack());

    document.getElementById('superAgenciesCard')?.addEventListener('click', () => this.openAgencies());
    document.getElementById('teamCard')?.addEventListener('click', () => this.openTeam());
    document.getElementById('agencyAddBtn')?.addEventListener('click', () => {
      document.getElementById('anError').style.display = 'none';
      document.getElementById('anInviteResult').style.display = 'none';
      document.getElementById('anSubmit').style.display = '';
      ['anName', 'anDirectorEmail', 'anDirectorName'].forEach(id => document.getElementById(id).value = '');
      slideForward('screen-agencies', 'screen-agency-new');
    });
    document.getElementById('anSubChips')?.querySelectorAll('.pe-chip').forEach(c =>
      c.addEventListener('click', () => {
        document.querySelectorAll('#anSubChips .pe-chip').forEach(x => x.classList.remove('on'));
        c.classList.add('on');
      }));
    document.getElementById('anSubmit')?.addEventListener('click', () => this._submitNewAgency());
    document.getElementById('anCopyLink')?.addEventListener('click', () => this._copy('anInviteLink'));

    document.getElementById('teamInviteBtn')?.addEventListener('click', () => {
      const role = window._agentProfile?.role;
      const title = role === 'admin' ? 'Пригласить МОПа' : 'Пригласить агента';
      document.getElementById('inviteNewTitle').textContent = title;
      document.getElementById('inNewError').style.display = 'none';
      document.getElementById('inNewResult').style.display = 'none';
      document.getElementById('inNewSubmit').style.display = '';
      document.getElementById('inNewEmail').value = '';
      slideForward('screen-team', 'screen-invite-new');
    });
    document.getElementById('inNewSubmit')?.addEventListener('click', () => this._submitNewInvite());
    document.getElementById('inNewCopy')?.addEventListener('click', () => this._copy('inNewLink'));

    document.getElementById('asSaveBtn')?.addEventListener('click', () => this._saveAgentStats());
  },

  _copy(inputId) {
    const el = document.getElementById(inputId);
    el.select();
    navigator.clipboard?.writeText(el.value).catch(() => {});
    App._toast('Скопировано ✓');
  },

  // ── Профильные карточки-входы ──────────────────────────────────────
  async refreshCards() {
    const role = window._agentProfile?.role;

    const superCard = document.getElementById('superAgenciesCard');
    if (superCard) {
      if (role === 'superadmin') {
        superCard.style.display = '';
        const agencies = await Sb.getAllAgencies();
        document.getElementById('superAgenciesCount').textContent = `${agencies.length} агентств`;
      } else {
        superCard.style.display = 'none';
      }
    }

    const teamCard = document.getElementById('teamCard');
    if (teamCard) {
      if (role === 'admin' || role === 'mop') {
        teamCard.style.display = '';
        const profiles = await Sb.getAgencyProfiles(window._agentProfile.agency_id);
        const mine = role === 'admin'
          ? profiles.filter(p => p.role === 'mop' || p.role === 'agent')
          : profiles.filter(p => p.role === 'agent' && p.mop_id === window._agentProfile.id);
        document.getElementById('teamCount').textContent = `${mine.length} человек`;
      } else {
        teamCard.style.display = 'none';
      }
    }
  },

  // ── Superadmin: агентства ──────────────────────────────────────────
  async openAgencies() {
    slideForward('screen-profile', 'screen-agencies');
    const list = document.getElementById('agenciesList');
    list.innerHTML = '<div class="prop-empty">Загрузка…</div>';
    const [agencies, profiles] = await Promise.all([Sb.getAllAgencies(), Sb.getAllProfiles()]);
    if (!agencies.length) {
      list.innerHTML = '<div class="prop-empty">Пока нет агентств. Нажмите «+ Создать»</div>';
      return;
    }
    list.innerHTML = agencies.map(a => {
      const team = profiles.filter(p => p.agency_id === a.id);
      const director = team.find(p => p.role === 'admin');
      const mopCount = team.filter(p => p.role === 'mop').length;
      const agentCount = team.filter(p => p.role === 'agent').length;
      const subLabel = { test: 'Тестовая', active: 'Официальная', suspended: 'Приостановлена' }[a.subscription_status] || a.subscription_status;
      return `<div class="agency-card">
        <div class="agency-card-name">${a.name}</div>
        <div class="agency-card-sub">${director ? director.name : 'Руководитель ещё не зарегистрирован'}</div>
        <div class="agency-card-sub">МОПов: ${mopCount} · Агентов: ${agentCount}</div>
        <span class="agency-badge ${a.subscription_status}">${subLabel}</span>
      </div>`;
    }).join('');
  },

  async _submitNewAgency() {
    const name = document.getElementById('anName').value.trim();
    const sub = document.querySelector('#anSubChips .pe-chip.on')?.dataset.val || 'test';
    const email = document.getElementById('anDirectorEmail').value.trim();
    const dName = document.getElementById('anDirectorName').value.trim();
    const errEl = document.getElementById('anError');
    errEl.style.display = 'none';
    if (!name || !email || !dName) {
      errEl.textContent = 'Заполните все поля';
      errEl.style.display = 'block';
      return;
    }
    const btn = document.getElementById('anSubmit');
    btn.textContent = 'Создаём...'; btn.disabled = true;
    try {
      const invite = await Sb.createAgency(name, sub, email, dName);
      document.getElementById('anInviteLink').value = `${location.origin}${location.pathname}?invite=${invite.token}`;
      document.getElementById('anInviteResult').style.display = '';
      btn.style.display = 'none';
    } catch (err) {
      errEl.textContent = err.message || 'Ошибка создания агентства';
      errEl.style.display = 'block';
      btn.textContent = 'Создать и получить ссылку-приглашение'; btn.disabled = false;
    }
  },

  // ── Директор/МОП: команда + KPI ─────────────────────────────────────
  async openTeam() {
    slideForward('screen-profile', 'screen-team');
    const kpiEl = document.getElementById('teamKpi');
    const listEl = document.getElementById('teamList');
    kpiEl.innerHTML = '<div class="prop-empty">Загрузка…</div>';
    listEl.innerHTML = '';

    const me = window._agentProfile;
    const [profiles, properties] = await Promise.all([
      Sb.getAgencyProfiles(me.agency_id),
      Sb.getAgencyProperties(me.agency_id),
    ]);

    kpiEl.innerHTML = this._kpiHtml(properties);

    if (me.role === 'admin') {
      const mops = profiles.filter(p => p.role === 'mop');
      const orphanAgents = profiles.filter(p => p.role === 'agent' && !p.mop_id);
      let html = '';
      mops.forEach(mop => {
        const agents = profiles.filter(p => p.role === 'agent' && p.mop_id === mop.id);
        html += `<div class="kpi-section-title">МОП: ${mop.name} (${agents.length})</div>`;
        html += agents.map(a => this._memberRowHtml(a)).join('') || '<div class="prop-empty">Нет агентов</div>';
      });
      if (orphanAgents.length) {
        html += `<div class="kpi-section-title">Без МОПа</div>`;
        html += orphanAgents.map(a => this._memberRowHtml(a)).join('');
      }
      listEl.innerHTML = html || '<div class="prop-empty">Пока нет команды — пригласите МОПа</div>';
    } else {
      const agents = profiles.filter(p => p.role === 'agent' && p.mop_id === me.id);
      listEl.innerHTML = agents.map(a => this._memberRowHtml(a)).join('') || '<div class="prop-empty">Пока нет агентов — пригласите</div>';
    }

    listEl.querySelectorAll('.team-member-row').forEach(row => {
      row.addEventListener('click', () => this._openAgentStats(row.dataset.id, profiles));
    });
  },

  _kpiHtml(properties) {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const countSince = ms => properties.filter(p => now - new Date(p.created_at).getTime() < ms).length;
    const byType = {};
    properties.forEach(p => { byType[p.type || '?'] = (byType[p.type || '?'] || 0) + 1; });
    const processed = properties.filter(p => p.exclusivity !== 'none').length;

    const typeTiles = Object.entries(byType).map(([t, n]) =>
      `<div class="kpi-tile"><div class="kpi-tile-num">${n}</div><div class="kpi-tile-lbl">${TYPE_LABELS[t] || t}</div></div>`
    ).join('');

    return `
      <div class="kpi-section-title">Объекты по категориям</div>
      <div class="kpi-row">${typeTiles || '<div class="prop-empty">Пока нет объектов</div>'}</div>
      <div class="kpi-section-title">Новые объекты</div>
      <div class="kpi-row">
        <div class="kpi-tile"><div class="kpi-tile-num">${countSince(day)}</div><div class="kpi-tile-lbl">за 24ч</div></div>
        <div class="kpi-tile"><div class="kpi-tile-num">${countSince(day * 7)}</div><div class="kpi-tile-lbl">за неделю</div></div>
        <div class="kpi-tile"><div class="kpi-tile-num">${countSince(day * 30)}</div><div class="kpi-tile-lbl">за месяц</div></div>
      </div>
      <div class="kpi-section-title">Обработано (эксклюзив/СНР)</div>
      <div class="kpi-row">
        <div class="kpi-tile"><div class="kpi-tile-num">${processed}</div><div class="kpi-tile-lbl">из ${properties.length}</div></div>
        <div class="kpi-tile"><div class="kpi-tile-num">—</div><div class="kpi-tile-lbl">дисциплина (скоро: Face ID)</div></div>
      </div>`;
  },

  _memberRowHtml(p) {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const stints = [];
    if (p.hired_at) {
      const years = ((Date.now() - new Date(p.hired_at).getTime()) / (365.25 * DAY_MS)).toFixed(1);
      stints.push(`стаж ${years} г.`);
    }
    stints.push(`задатков: ${p.deposits_manual || 0}`);
    stints.push(`вал: ${(p.volume_manual || 0).toLocaleString('ru')} ₸`);
    return `<div class="team-member-row" data-id="${p.id}">
      <div class="colleague-avatar">${(p.name || '?')[0].toUpperCase()}</div>
      <div class="team-member-body">
        <div class="team-member-name">${p.name || 'Без имени'}</div>
        <div class="team-member-sub">${stints.join(' · ')}</div>
      </div>
    </div>`;
  },

  async _submitNewInvite() {
    const email = document.getElementById('inNewEmail').value.trim();
    const errEl = document.getElementById('inNewError');
    errEl.style.display = 'none';
    if (!email) { errEl.textContent = 'Введите email'; errEl.style.display = 'block'; return; }
    const me = window._agentProfile;
    const role = me.role === 'admin' ? 'mop' : 'agent';
    const btn = document.getElementById('inNewSubmit');
    btn.textContent = 'Создаём...'; btn.disabled = true;
    try {
      const invite = await Sb.createInvite(me.agency_id, email, role, me.id);
      document.getElementById('inNewLink').value = `${location.origin}${location.pathname}?invite=${invite.token}`;
      document.getElementById('inNewResult').style.display = '';
      btn.style.display = 'none';
    } catch (err) {
      errEl.textContent = err.message || 'Ошибка создания приглашения';
      errEl.style.display = 'block';
      btn.textContent = 'Создать приглашение'; btn.disabled = false;
    }
  },

  _openAgentStats(agentId, profiles) {
    const p = profiles.find(x => x.id === agentId);
    if (!p) return;
    this._statsEditingId = agentId;
    document.getElementById('agentStatsTitle').textContent = `Показатели: ${p.name || ''}`;
    document.getElementById('asHiredAt').value = p.hired_at || '';
    document.getElementById('asDeposits').value = p.deposits_manual || 0;
    document.getElementById('asVolume').value = p.volume_manual || 0;
    slideForward('screen-team', 'screen-agent-stats');
  },

  async _saveAgentStats() {
    const btn = document.getElementById('asSaveBtn');
    btn.textContent = 'Сохраняем...'; btn.disabled = true;
    try {
      await Sb.updateAgentStats(this._statsEditingId, {
        hired_at: document.getElementById('asHiredAt').value || null,
        deposits_manual: parseInt(document.getElementById('asDeposits').value) || 0,
        volume_manual: parseInt(document.getElementById('asVolume').value) || 0,
      });
      App._toast('Сохранено ✓');
      slideBack();
      this.openTeam();
    } catch (err) {
      alert('Не удалось сохранить: ' + (err.message || err));
    } finally {
      btn.textContent = 'Сохранить'; btn.disabled = false;
    }
  },
};
