/* ─────────────────────────────────────────
   agnt.24 App — core logic
───────────────────────────────────────── */

const App = {
  // Кто в агентстве уже взял «В базу» какой krisha-объект — { [krishaId]: {agentId, agentName} }.
  // Реальные данные из Supabase (все агенты видят claims друг друга — RLS "Agent read own agency"),
  // а не только localStorage этого телефона. См. _loadAgencyClaims().
  _agencyClaims: {},

  state: {
    mode:      'sale',
    district:  null,
    type:      'apt',
    timeFilter: '24h',
    btFilter:  [],
    roomsFilter: [],
    conditionFilter: [],
    yearFilter: [],
    microdistrictFilter: [],
    priceFrom: 0,
    priceTo:   200000000,
    feedPrev:  'screen-map',
    claimed: JSON.parse(localStorage.getItem('24s_claimed') || '{}'),
    saved:   JSON.parse(localStorage.getItem('24s_saved')   || '{}'),
    activeSeg:  'claimed',
    currentTab: 'map',
  },

  init() {
    this.renderMap();
    this.bindMap();
    this.bindBottomPanel();
    this.bindTrioToggle();
    this.bindPriceModal();
    this.bindTabBar();
    this.bindBaseSeg();
    this.bindDistrictBack();
    this.bindFilterBack();
    this.bindFilterApply();
    this.bindFeedBack();
    this.updateFindCount();
    this.precomputeAvgPrices();
    this.initEditScreen();
  },

  // ──────────────────────────────────────
  // PRECOMPUTE MARKET AVERAGES
  // ──────────────────────────────────────
  precomputeAvgPrices() {
    this._avgPm2 = {};
    LISTINGS.forEach(l => {
      if (l.mode === 'archive' || !l.area || !l.price) return;
      const k = `${l.district}-${l.type}`;
      if (!this._avgPm2[k]) this._avgPm2[k] = { sum: 0, n: 0 };
      this._avgPm2[k].sum += l.price / l.area;
      this._avgPm2[k].n++;
    });
    Object.values(this._avgPm2).forEach(v => { v.avg = v.sum / v.n; });
  },

  marketDiff(l) {
    if (!l.area || !l.price) return null;
    const k = `${l.district}-${l.type}`;
    const a = this._avgPm2[k];
    if (!a) return null;
    return Math.round((l.price / l.area - a.avg) / a.avg * 100);
  },

  // ──────────────────────────────────────
  // TIME FILTER — 24ч / 3 дня / Неделя
  // ──────────────────────────────────────
  // "24 часа" = рабочие сутки риэлтора: с 8:00 текущего (или предыдущего) дня,
  // а не скользящее окно "последние 24 часа" — ночью новых объектов почти нет.
  timeCutoffMs(filter) {
    if (filter === '24h') {
      const now = new Date();
      const today8 = new Date(now);
      today8.setHours(8, 0, 0, 0);
      const anchor = now >= today8 ? today8 : new Date(today8.getTime() - 86400000);
      return anchor.getTime();
    }
    const hoursMap = { '3d': 72, 'week': 168 };
    return Date.now() - (hoursMap[filter] || 24) * 3600000;
  },

  // ──────────────────────────────────────
  // TAB BAR
  // ──────────────────────────────────────
  bindTabBar() {
    document.querySelectorAll('.tab-item').forEach(item => {
      item.addEventListener('click', () => this.switchTab(item.dataset.tab));
    });
  },

  switchTab(tab) {
    const tabScreens = {
      map:        'screen-map',
      base:       'screen-base',
      profile:    'screen-profile',
      properties: 'screen-properties',
      crm:        'screen-crm',
    };

    // Защита: агентские вкладки требуют авторизации
    if ((tab === 'properties' || tab === 'crm') && !window._agentProfile) {
      Auth.showAgentLogin();
      return;
    }

    // Таб-бар виден на всех экранах, поэтому переход может случиться из вложенного
    // экрана (район/фильтр/лента), а не только с "текущей" вкладки — скрываем ВСЕ
    // экраны кроме целевого, а не только тот, что записан как currentTab.
    const next = tabScreens[tab];
    const nextEl = document.getElementById(next);
    const alreadyThere = tab === this.state.currentTab && nextEl && nextEl.classList.contains('active');

    document.querySelectorAll('.tab-item').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
    this.state.currentTab = tab;
    _navStack.length = 0; // явный переход по табам сбрасывает стек вложенной навигации

    if (!alreadyThere) {
      document.querySelectorAll('.screen').forEach(s => {
        if (s !== nextEl) { s.classList.remove('active'); s.classList.add('slide-below'); }
      });
      if (nextEl) { nextEl.classList.remove('slide-below','slide-above'); nextEl.classList.add('active'); }
    }

    if (tab === 'base')       this.renderBase();
    if (tab === 'profile')    this.renderProfile();
    if (tab === 'properties') AgentProperties.renderList();
    if (tab === 'crm')        AgentCrm.renderBoard();

    setTimeout(() => {
      document.querySelectorAll('.screen').forEach(s => {
        if (s !== nextEl) s.classList.remove('slide-above','slide-below');
      });
    }, 420);
  },

  // ──────────────────────────────────────
  // MAP
  // ──────────────────────────────────────
  renderMap() {
    const svg = document.getElementById('mapSvg');
    const mode   = this.state.mode;
    const isArch = mode === 'archive';

    // Считаем объекты по районам динамически из LISTINGS
    const distCounts = {};
    LISTINGS.forEach(l => {
      if (!this._matchesMode(l)) return;
      if (l.type !== this.state.type) return;
      if (l.price < this.state.priceFrom || l.price > this.state.priceTo) return;
      distCounts[l.district] = (distCounts[l.district] || 0) + 1;
    });

    DISTRICTS.forEach(d => {
      const g = svg.querySelector(`[data-district="${d.id}"]`);
      if (!g) return;
      const count = distCounts[d.id] || 0;
      const mainCircle = g.querySelector('.bubble-main');
      const countText  = g.querySelector('.bubble-count');
      const isSelected = this.state.district === d.id;

      const shineCircle = g.querySelector('.bubble-shine');

      if (isArch) {
        mainCircle.setAttribute('fill', 'rgba(255,255,255,0.9)');
        mainCircle.setAttribute('stroke', d.color);
        mainCircle.setAttribute('stroke-width', '2.5');
        mainCircle.setAttribute('stroke-dasharray', '4,3');
        mainCircle.removeAttribute('filter');
        if (shineCircle) shineCircle.setAttribute('fill', 'url(#sphere-arch)');
        g.querySelector('.bubble-count').setAttribute('fill', d.color);
        g.querySelector('.bubble-name').setAttribute('fill', '#9fa6b2');
      } else {
        mainCircle.setAttribute('fill', d.color);
        mainCircle.setAttribute('filter', isSelected ? 'none' : 'url(#bub-shadow)');
        mainCircle.setAttribute('stroke', isSelected ? 'white' : 'none');
        mainCircle.setAttribute('stroke-width', isSelected ? '3' : '0');
        mainCircle.removeAttribute('stroke-dasharray');
        if (shineCircle) shineCircle.setAttribute('fill', 'url(#sphere-shine)');
        g.querySelector('.bubble-count').setAttribute('fill', 'white');
        g.querySelector('.bubble-name').setAttribute('fill', 'rgba(255,255,255,0.92)');
      }

      if (countText) countText.textContent = count;

      let ring = g.querySelector('.sel-ring');
      if (isSelected && !isArch) {
        if (!ring) {
          ring = document.createElementNS('http://www.w3.org/2000/svg','circle');
          ring.setAttribute('class','sel-ring');
          ring.setAttribute('fill','none');
          ring.setAttribute('stroke', d.color);
          ring.setAttribute('stroke-width','2');
          ring.setAttribute('opacity','.35');
          g.insertBefore(ring, g.firstChild);
        }
        const cx = mainCircle.getAttribute('cx');
        const cy = mainCircle.getAttribute('cy');
        const r  = parseFloat(mainCircle.getAttribute('r'));
        ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('r', r + 7);
      } else if (ring) { ring.remove(); }
    });

    const liveDot = document.querySelector('.live-dot');
    if (liveDot) liveDot.classList.toggle('muted', isArch);

    const counter = document.getElementById('liveCount');
    if (counter) {
      const total = Object.values(distCounts).reduce((s, v) => s + v, 0);
      counter.textContent = isArch ? `${total.toLocaleString('ru')} архив.` : `${total} сейчас`;
    }

    const strip = document.getElementById('archDateStrip');
    if (strip) strip.classList.toggle('visible', isArch);
  },

  bindMap() {
    const svg = document.getElementById('mapSvg');
    svg.querySelectorAll('.bubble-g').forEach(g => {
      g.addEventListener('click', () => {
        const id = g.dataset.district;
        this.state.district = id;
        this.state.btFilter  = [];
        this.state.roomsFilter = [];
        this.state.conditionFilter = [];
        this.state.yearFilter = [];
        this.state.microdistrictFilter = [];
        this.renderMap();
        this.updateFindCount();
        setTimeout(() => this.openDistrict(id), 140);
      });
    });
  },

  bindBottomPanel() {
    document.querySelectorAll('.type-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.type-chip').forEach(c => c.classList.remove('on'));
        chip.classList.add('on');
        this.state.type = chip.dataset.type;
        this.renderMap();
        this.updateFindCount();
      });
    });

    document.getElementById('findBtn').addEventListener('click', () => {
      if (this.state.district) this.openDistrict(this.state.district);
      else this.openFeed('screen-map');
    });
  },

  bindTrioToggle() {
    document.querySelectorAll('.trio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.trio-btn').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        this.state.mode = btn.dataset.mode;
        if (this.state.mode === 'archive') this.state.district = null;
        this.renderMap();
        this.updateFindCount();
      });
    });
  },

  updateFindCount() {
    const listings = this.getFilteredListings();
    const btn = document.getElementById('findBtn');
    const countEl = btn.querySelector('.find-count');
    if (countEl) countEl.textContent = `${listings.length} ${pluralObj(listings.length)}`;
  },

  // Единая проверка "Продажа/Аренда/Архив" — l.mode хранит ровно одно из
  // 'sale'/'rent'/'archive' (см. build_app_data.py), поэтому режим экрана
  // должен сравниваться напрямую с ним же, а не с несуществующим l.dealType.
  _matchesMode(l) {
    if (this.state.mode === 'archive') return l.mode === 'archive';
    if (this.state.mode === 'rent') return l.mode === 'rent';
    return l.mode === 'sale';
  },

  // Подтягивает реальные claims агентства (кто уже взял какой krisha-объект
  // «В базу») из Supabase — источник правды для красной/зелёной лампочки и
  // баннера «занято коллегой», вместо localStorage одного телефона.
  async _loadAgencyClaims() {
    if (!window._agentProfile) return;
    try {
      const rows = await Sb.getAgencyClaimedKrishaIds(window._agentProfile.agency_id);
      const map = {};
      rows.forEach(r => {
        if (!r.source_krisha_id) return;
        map[r.source_krisha_id] = { agentId: r.agent_id, agentName: r.profiles?.name || 'Коллега' };
      });
      this._agencyClaims = map;
      // Перерисуем то, что уже открыто на экране, если данные подъехали позже рендера
      if (document.getElementById('screen-district')?.classList.contains('active')) this.renderDistrictGrid();
      if (document.getElementById('screen-feed')?.classList.contains('active')) this.renderFeed(this.getFilteredListings());
    } catch (err) {
      console.error('_loadAgencyClaims failed', err);
    }
  },

  getFilteredListings() {
    return LISTINGS.filter(l => {
      if (!this._matchesMode(l)) return false;
      if (this.state.district && l.district !== this.state.district) return false;
      if (l.type !== this.state.type) return false;
      if (l.price < this.state.priceFrom || l.price > this.state.priceTo) return false;
      if (this.state.btFilter.length && !this.state.btFilter.includes(l.buildingType)) return false;
      if (this.state.roomsFilter.length && l.type === 'apt') {
        const r = l.rooms === 0 ? 'studio' : String(l.rooms || '');
        const rKey = l.rooms >= 5 ? '5+' : r;
        if (!this.state.roomsFilter.includes(rKey) && !(l.rooms >= 5 && this.state.roomsFilter.includes('5+'))) return false;
      }
      if (this.state.conditionFilter.length && !this.state.conditionFilter.includes(l.condition)) return false;
      if (this.state.yearFilter.length && !this.state.yearFilter.includes(yearBucket(l.yearBuilt))) return false;
      if (this.state.microdistrictFilter.length && !this.state.microdistrictFilter.includes(l.microdistrict)) return false;
      return true;
    });
  },

  // ──────────────────────────────────────
  // PRICE MODAL
  // ──────────────────────────────────────
  bindPriceModal() {
    const overlay = document.getElementById('priceModal');
    const fromInput = document.getElementById('priceFrom');
    const toInput   = document.getElementById('priceTo');

    document.querySelectorAll('.price-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        fromInput.value = this.state.priceFrom > 0 ? Math.round(this.state.priceFrom / 1000000) : '';
        toInput.value   = this.state.priceTo < 200000000 ? Math.round(this.state.priceTo / 1000000) : '';
        overlay.classList.add('open');
        setTimeout(() => fromInput.focus(), 250);
      });
    });

    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });

    document.getElementById('priceApply').addEventListener('click', () => {
      const from = parseFloat(fromInput.value) || 0;
      const to   = parseFloat(toInput.value)   || 200;
      this.state.priceFrom = from * 1000000;
      this.state.priceTo   = to   * 1000000;
      this.updatePricePill();
      this.updateFindCount();
      overlay.classList.remove('open');
    });
  },

  updatePricePill() {
    const fromEl = document.getElementById('ppFromVal');
    const toEl   = document.getElementById('ppToVal');
    fromEl.textContent = this.state.priceFrom > 0   ? `${Math.round(this.state.priceFrom/1000000)} млн` : 'любая';
    toEl.textContent   = this.state.priceTo < 200e6 ? `${Math.round(this.state.priceTo/1000000)} млн`  : 'любая';
  },

  // ──────────────────────────────────────
  // SCREEN 2 — DISTRICT DETAIL
  // ──────────────────────────────────────
  bindDistrictBack() {
    document.getElementById('dsBack').addEventListener('click', () => slideBack());
  },

  openDistrict(districtId) {
    this.state.district = districtId;
    const d = DISTRICTS.find(x => x.id === districtId);

    document.getElementById('dsName').textContent = d.name;
    this.renderDistrictGrid();
    slideForward('screen-map', 'screen-district');

    // time tabs
    document.querySelectorAll('#districtTimeTabs .ttab').forEach(t => {
      t.classList.toggle('on', t.dataset.time === this.state.timeFilter);
      t.onclick = () => {
        this.state.timeFilter = t.dataset.time;
        document.querySelectorAll('#districtTimeTabs .ttab').forEach(x => x.classList.toggle('on', x === t));
        this.renderDistrictGrid();
      };
    });
  },

  renderDistrictGrid() {
    const grid = document.getElementById('typeGrid');
    const cutoffMs = this.timeCutoffMs(this.state.timeFilter);
    const mode = this.state.mode;

    const isOwner = mode === 'archive';

    // Count by type
    const counts = {}, newCounts = {}, claimedCounts = {};
    LISTINGS.forEach(l => {
      if (l.district !== this.state.district) return;
      if (!this._matchesMode(l)) return;
      if (l.price < this.state.priceFrom || l.price > this.state.priceTo) return;
      counts[l.type] = (counts[l.type] || 0) + 1;
      if (l.firstSeen && new Date(l.firstSeen).getTime() > cutoffMs) {
        newCounts[l.type] = (newCounts[l.type] || 0) + 1;
      }
      // Реальные claims агентства (Supabase) — не только этого телефона, иначе
      // лампочка врёт про то, что уже взяли коллеги на других устройствах.
      if (isOwner && (this._agencyClaims[l.id] || this.state.claimed[l.id])) {
        claimedCounts[l.type] = (claimedCounts[l.type] || 0) + 1;
      }
    });

    // Update subtitle
    const total = Object.values(counts).reduce((s,v)=>s+v,0);
    const newTotal = Object.values(newCounts).reduce((s,v)=>s+v,0);
    const timeLabel = { '24h': 'сегодня', '3d': 'за 3 дня', 'week': 'за неделю' }[this.state.timeFilter];
    document.getElementById('dsSub').textContent = `${total} ${pluralObj(total)} · ${newTotal} новых ${timeLabel}`;

    grid.innerHTML = TYPES.map(t => {
      const cnt = counts[t.id] || 0;
      if (!cnt) return '';
      const newCnt = newCounts[t.id] || 0;
      let lampHtml = '';
      if (isOwner) {
        const claimed = claimedCounts[t.id] || 0;
        const green = claimed > 0;
        lampHtml = `<div class="tc-lamp-row">
          <div class="tc-lamp"><span class="lamp-dot ${green ? 'lamp-green' : 'lamp-red'}"></span><span class="lamp-lbl">${green ? `${claimed} в базе` : 'не в базе'}</span></div>
          <button class="tc-base-btn" data-type="${t.id}">В базу →</button>
        </div>`;
      }
      return `
      <div class="type-card" data-type="${t.id}">
        ${newCnt > 0 ? `<div class="tc-new">+${newCnt} нов.</div>` : ''}
        <div class="tc-icon">${typeIcon(t.id)}</div>
        <div>
          <div class="tc-count">${cnt}</div>
          <div class="tc-label">${t.label}</div>
        </div>
        ${lampHtml}
      </div>`;
    }).join('');

    grid.querySelectorAll('.type-card').forEach(card => {
      card.addEventListener('click', () => {
        this.state.type = card.dataset.type;
        this.state.btFilter = [];
        this.state.roomsFilter = [];
        this.state.conditionFilter = [];
        this.state.yearFilter = [];
        this.state.microdistrictFilter = [];
        this.openFilter();
      });
    });

    // "В базу" button — opens feed directly (skip filter screen)
    grid.querySelectorAll('.tc-base-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.state.type = btn.dataset.type;
        this.state.btFilter = [];
        this.state.roomsFilter = [];
        this.state.conditionFilter = [];
        this.state.yearFilter = [];
        this.state.microdistrictFilter = [];
        this.openFeed('screen-district');
      });
    });
  },

  // ──────────────────────────────────────
  // SCREEN 2.5 — FILTERS
  // ──────────────────────────────────────
  bindFilterBack() {
    document.getElementById('filtBack').addEventListener('click', () => slideBack());
  },

  bindFilterApply() {
    document.getElementById('filtApply').addEventListener('click', () => {
      this.openFeed();
    });
  },

  openFilter() {
    const typeLabel = TYPES.find(t => t.id === this.state.type)?.label || '';
    const d = DISTRICTS.find(x => x.id === this.state.district);
    const distShort = d ? d.name.replace(/ский$/, '').replace(/ская$/, '') : '';
    document.getElementById('filtTitle').textContent = `${typeLabel} · ${distShort}.`;

    this.renderFilterContent();
    slideForward('screen-district', 'screen-filter');

    document.querySelectorAll('#filterTimeTabs .ttab').forEach(t => {
      t.classList.toggle('on', t.dataset.time === this.state.timeFilter);
      t.onclick = () => {
        this.state.timeFilter = t.dataset.time;
        document.querySelectorAll('#filterTimeTabs .ttab').forEach(x => x.classList.toggle('on', x === t));
        this.renderFilterContent();
      };
    });
  },

  // Faceted-счётчики: чип каждой группы считается по всем остальным уже
  // выбранным фильтрам (кроме своей же группы) — иначе цифры "врут", если
  // пользователь уже что-то выбрал в другой группе.
  _facetBase(excludeGroup) {
    return LISTINGS.filter(l => {
      if (l.district !== this.state.district) return false;
      if (l.type !== this.state.type) return false;
      if (!this._matchesMode(l)) return false;
      if (l.price < this.state.priceFrom || l.price > this.state.priceTo) return false;
      if (excludeGroup !== 'bt' && this.state.btFilter.length && !this.state.btFilter.includes(l.buildingType)) return false;
      if (excludeGroup !== 'rooms' && this.state.roomsFilter.length && l.type === 'apt') {
        const r = l.rooms === 0 ? 'studio' : String(l.rooms || '');
        const rKey = l.rooms >= 5 ? '5+' : r;
        if (!this.state.roomsFilter.includes(rKey) && !(l.rooms >= 5 && this.state.roomsFilter.includes('5+'))) return false;
      }
      if (excludeGroup !== 'cond' && this.state.conditionFilter.length && !this.state.conditionFilter.includes(l.condition)) return false;
      if (excludeGroup !== 'year' && this.state.yearFilter.length && !this.state.yearFilter.includes(yearBucket(l.yearBuilt))) return false;
      if (excludeGroup !== 'micro' && this.state.microdistrictFilter.length && !this.state.microdistrictFilter.includes(l.microdistrict)) return false;
      return true;
    });
  },

  renderFilterContent() {
    // Новых за выбранный период — среди того, что реально попадёт в выдачу
    // при текущей комбинации всех фильтров.
    const cutoffMs = this.timeCutoffMs(this.state.timeFilter);
    this._filterNewCount = this.getFilteredListings()
      .filter(l => l.firstSeen && new Date(l.firstSeen).getTime() > cutoffMs).length;

    // Building types — считаем без учёта своего же фильтра, но с учётом
    // комнатности/состояния/года, которые уже выбраны.
    const btBase = this._facetBase('bt');
    const btCounts = {};
    btBase.forEach(l => {
      if (l.buildingType) btCounts[l.buildingType] = (btCounts[l.buildingType] || 0) + 1;
    });

    // Rooms (only for apt)
    const roomsBase = this._facetBase('rooms');
    const roomCounts = {};
    if (this.state.type === 'apt') {
      roomsBase.forEach(l => {
        const r = l.rooms === 0 ? 'studio' : (l.rooms >= 5 ? '5+' : String(l.rooms || ''));
        if (r) roomCounts[r] = (roomCounts[r] || 0) + 1;
      });
    }

    // Condition (состояние)
    const condBase = this._facetBase('cond');
    const condCounts = {};
    condBase.forEach(l => {
      if (l.condition) condCounts[l.condition] = (condCounts[l.condition] || 0) + 1;
    });

    // Год постройки
    const yearBase = this._facetBase('year');
    const yearCounts = {};
    yearBase.forEach(l => {
      const b = yearBucket(l.yearBuilt);
      if (b) yearCounts[b] = (yearCounts[b] || 0) + 1;
    });

    // Микрорайон (8 р-нов Алматы) / Посёлок (Талгарский) — из адреса на krisha.kz,
    // см. parse_microdistrict() в парсере. Талгарский делится не на микрорайоны,
    // а на посёлки вокруг Талгара (без углубления в сам город Талгар).
    const microBase = this._facetBase('micro');
    const microCounts = {};
    microBase.forEach(l => {
      if (l.microdistrict) microCounts[l.microdistrict] = (microCounts[l.microdistrict] || 0) + 1;
    });

    let html = '';

    // Ключи чипов = у кого есть реальный count СЕЙЧАС, ПЛЮС уже выбранные
    // значения (даже если из-за других фильтров их count просел до 0) —
    // иначе активный чип пользователя пропадёт из вида и его нельзя снять.
    const btKeys = new Set([...Object.keys(btCounts), ...this.state.btFilter]);
    if (btKeys.size) {
      html += `<div class="filt-section">
        <div class="filt-section-label">Тип дома</div>
        <div class="filt-chips" data-group="bt">
          ${[...btKeys].map(bt => {
            const n = btCounts[bt] || 0;
            return `<div class="filt-chip${this.state.btFilter.includes(bt) ? ' on':''}" data-val="${bt}">
              ${bt}<span class="fc-sub">${n} ${pluralObj(n)}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }

    const roomOrder = ['1','2','3','4','5+','studio'];
    const roomLabels = { studio: 'Студия' };
    const roomKeys = roomOrder.filter(r => roomCounts[r] || this.state.roomsFilter.includes(r));
    if (roomKeys.length) {
      html += `<div class="filt-section">
        <div class="filt-section-label">Комнатность</div>
        <div class="filt-chips" data-group="rooms">
          ${roomKeys.map(r => {
            const n = roomCounts[r] || 0;
            return `<div class="filt-chip${this.state.roomsFilter.includes(r) ? ' on':''}" data-val="${r}">
              ${roomLabels[r] || r}<span class="fc-sub">${n}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }

    const condOrder = ['чистовая', 'черновая', 'ремонт'];
    const condLabels = { 'чистовая': 'Чистовая', 'черновая': 'Черновая', 'ремонт': 'Требует ремонта' };
    const condKeys = condOrder.filter(c => condCounts[c] || this.state.conditionFilter.includes(c));
    if (condKeys.length) {
      html += `<div class="filt-section">
        <div class="filt-section-label">Состояние</div>
        <div class="filt-chips" data-group="cond">
          ${condKeys.map(c => {
            const n = condCounts[c] || 0;
            return `<div class="filt-chip${this.state.conditionFilter.includes(c) ? ' on':''}" data-val="${c}">
              ${condLabels[c]}<span class="fc-sub">${n}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }

    const yearKeys = YEAR_BUCKET_ORDER.filter(b => yearCounts[b] || this.state.yearFilter.includes(b));
    if (yearKeys.length) {
      html += `<div class="filt-section">
        <div class="filt-section-label">Год постройки</div>
        <div class="filt-chips" data-group="year">
          ${yearKeys.map(b => {
            const n = yearCounts[b] || 0;
            return `<div class="filt-chip${this.state.yearFilter.includes(b) ? ' on':''}" data-val="${b}">
              ${YEAR_BUCKET_LABELS[b]}<span class="fc-sub">${n}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }

    const microLabel = this.state.district === 'talgar' ? 'Посёлок' : 'Микрорайон';
    const microKeys = new Set([...Object.keys(microCounts), ...this.state.microdistrictFilter]);
    if (microKeys.size) {
      const orderedMicroKeys = [...microKeys].sort((a, b) => (microCounts[b] || 0) - (microCounts[a] || 0));
      html += `<div class="filt-section">
        <div class="filt-section-label">${microLabel}</div>
        <div class="filt-chips" data-group="micro">
          ${orderedMicroKeys.map(m => {
            const n = microCounts[m] || 0;
            return `<div class="filt-chip${this.state.microdistrictFilter.includes(m) ? ' on':''}" data-val="${m}">
              ${m}<span class="fc-sub">${n}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }

    document.getElementById('filtScroll').innerHTML = html;
    this.updateFilterCount();

    // Bind chips — при любом клике полностью пересчитываем и перерисовываем
    // экран, чтобы счётчики ВСЕХ групп сразу отражали новую комбинацию фильтров.
    document.querySelectorAll('#filtScroll .filt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const group = chip.closest('[data-group]').dataset.group;
        const val   = chip.dataset.val;
        const targetFilter = group === 'bt' ? this.state.btFilter
                            : group === 'cond' ? this.state.conditionFilter
                            : group === 'year' ? this.state.yearFilter
                            : group === 'micro' ? this.state.microdistrictFilter
                            : this.state.roomsFilter;
        const i = targetFilter.indexOf(val);
        if (i >= 0) targetFilter.splice(i,1); else targetFilter.push(val);
        this.renderFilterContent();
      });
    });
  },

  updateFilterCount() {
    const n = this.getFilteredListings().length;
    document.getElementById('filtCount').textContent = `${n} ${pluralObj(n)}`;
    const newCnt = this._filterNewCount || 0;
    const timeLabel = { '24h': 'сегодня', '3d': 'за 3 дня', 'week': 'за неделю' }[this.state.timeFilter];
    document.getElementById('filtSub').textContent = newCnt > 0
      ? `${n} ${pluralObj(n)} · ${newCnt} новых ${timeLabel}`
      : `${n} ${pluralObj(n)}`;
  },

  // ──────────────────────────────────────
  // SCREEN 3 — FEED
  // ──────────────────────────────────────
  bindFeedBack() {
    document.getElementById('feedBack').addEventListener('click', () => slideBack());
  },

  openFeed(fromScreen) {
    const listings = this.getFilteredListings();
    if (!listings.length) {
      this._toast('Ничего не найдено — попробуйте другие фильтры');
      return;
    }

    this.state.feedPrev = fromScreen || (this.state.district ? 'screen-filter' : 'screen-map');

    const typeLabel = TYPES.find(t => t.id === this.state.type)?.label || '';
    const d = DISTRICTS.find(x => x.id === this.state.district);
    const distShort = d ? d.name.replace(/ский$/, '').replace(/ская$/, '') : 'Все районы';
    const timeLabel = { '24h': '24ч', '3d': '3 дня', 'week': 'Неделя' }[this.state.timeFilter];

    document.getElementById('feedCrumb').textContent   = `${typeLabel} · ${distShort}.`;
    document.getElementById('feedTimeChip').textContent = timeLabel;

    this.renderFeed(listings);
    slideForward(this.state.feedPrev, 'screen-feed');
  },

  renderFeed(listings) {
    const wrapper = document.getElementById('feedWrapper');
    wrapper.innerHTML = '';
    wrapper.scrollTop = 0;

    listings.forEach((l, i) => {
      wrapper.insertAdjacentHTML('beforeend', this.buildCard(l, i, listings.length));
    });

    // Phone reveal
    wrapper.querySelectorAll('.fc-phone-row').forEach(el => {
      el.addEventListener('click', () => {
        const num = el.querySelector('.fc-ph-num');
        if (!num) return;
        const phone = num.dataset.phone;
        if (num.classList.contains('hidden-num')) {
          num.textContent = phone;
          num.classList.remove('hidden-num');
          el.querySelector('.fc-ph-lbl').textContent = 'Собственник · Казахстан';
        }
      });
    });

    // Fix / claim
    wrapper.querySelectorAll('.fc-fix-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.listing;
        if (!id || btn.classList.contains('taken')) return;
        const isMine = !!this.state.claimed[id];
        if (isMine) {
          const removed = this.state.claimed[id];
          delete this.state.claimed[id];
          AgentRating.recordAbandon();
          btn.className = 'fc-fix-btn free';
          btn.textContent = 'В базу';
          if (removed?.supabaseId && window._agentProfile) {
            Sb.upsertProperty({ id: removed.supabaseId, status: 'archived' }).catch(console.error);
          }
        } else {
          // Кнопка видна всем (карта/лента работают без авторизации) — но без
          // профиля агента _syncClaimToSupabase() молча ничего не пишет в БД,
          // а UI при этом врал бы "✓ Вы взяли в работу". Без входа объект
          // никогда не появится в «Мои объекты» — блокируем на входе, а не
          // даём ложный успех.
          if (!window._agentProfile) {
            this._toast('Войдите как агент, чтобы объект попал в «Мои объекты»');
            Auth.showAgentLogin();
            return;
          }
          // Защита от гонки: коллега мог занять объект долями секунды раньше,
          // чем эта кнопка перерисовалась (_agencyClaims обновляется по polling).
          const myId = window._agentProfile?.id;
          const existing = this._agencyClaims[id];
          if (existing && existing.agentId !== myId) {
            this._toast(`Уже занято: ${existing.agentName || 'коллега'}`);
            btn.className = 'fc-fix-btn taken';
            btn.disabled = true;
            btn.textContent = 'В базу — занято коллегой';
            return;
          }
          const counter = parseInt(localStorage.getItem('24s_serial') || '0') + 1;
          localStorage.setItem('24s_serial', String(counter));
          const serial = `МО-${String(counter).padStart(4, '0')}`;
          const l = LISTINGS.find(x => x.id === id);
          // Стартуем с фото krisha (как у ilvo.pro — импорт по объекту, не по всему рынку).
          // Агент может дозаменить/добавить свои — это просто стартовые данные.
          const startPhotos = (l && l.photos && l.photos.length) ? l.photos.slice(0, 5) : [];
          this.state.claimed[id] = {
            serial,
            claimedAt: new Date().toISOString(),
            editData: { photos: startPhotos },
          };
          AgentRating.recordClaim();
          btn.className = 'fc-fix-btn mine';
          btn.textContent = '✓ Вы взяли в работу';
          this._syncClaimToSupabase(id);
        }
        localStorage.setItem('24s_claimed', JSON.stringify(this.state.claimed));
      });
    });

    // Save / bookmark ("Сохранённые" на экране «Моя База»)
    wrapper.querySelectorAll('.fc-bookmark-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.listing;
        if (!id) return;
        const svg = btn.querySelector('svg');
        if (this.state.saved[id]) {
          delete this.state.saved[id];
          btn.classList.remove('on');
          svg.setAttribute('fill', 'none');
        } else {
          this.state.saved[id] = { savedAt: new Date().toISOString() };
          btn.classList.add('on');
          svg.setAttribute('fill', 'white');
        }
        localStorage.setItem('24s_saved', JSON.stringify(this.state.saved));
      });
    });
  },

  buildCard(l, index, total) {
    const isArch = l.mode === 'archive';
    const myId = window._agentProfile?.id;
    const realClaim = this._agencyClaims[l.id]; // {agentId, agentName} — реальный claim в агентстве (Supabase)
    const isMine = !!(realClaim && myId && realClaim.agentId === myId) || !!this.state.claimed[l.id];
    const takenByColleague = !!(realClaim && !isMine);
    // Синтетический демо-баннер архива — только пока нет реальных данных о claim
    const isTaken = takenByColleague || (isArch && !realClaim && l.claimedBy && !isMine);

    const pm2 = l.area ? Math.round(l.price / l.area) : null;
    const diff = this.marketDiff(l);
    const diffLabel = diff !== null ? `${diff > 0 ? '+' : ''}${diff}% рынка` : '';
    const diffClass = diff !== null ? (diff <= 0 ? 'below' : 'above') : '';

    const firstSeen = l.firstSeen ? new Date(l.firstSeen) : null;
    const minsAgo = firstSeen ? Math.round((Date.now() - firstSeen.getTime()) / 60000) : null;
    const timeAgoStr = minsAgo === null ? '' :
      minsAgo < 60   ? `${minsAgo} мин назад` :
      minsAgo < 1440 ? `${Math.round(minsAgo/60)} ч назад` :
                       `${Math.round(minsAgo/1440)} дн назад`;
    const isNew = minsAgo !== null && minsAgo < 4320; // 3 days

    const sellerText = 'Собственник';
    const d = DISTRICTS.find(x => x.id === l.district);
    const metaText = [d?.name, l.buildingType, l.floor && l.floors ? `${l.floor}/${l.floors} эт` : null, sellerText].filter(Boolean).join(' · ');

    // Owner contact bottom — для всех объектов от Хозяина
    let ownerBottom = '';
    if (l.ownerPhone) {
      if (takenByColleague) {
        // Реальный claim коллеги в агентстве (Supabase) — не демо-данные
        const name = realClaim.agentName || 'Коллега';
        ownerBottom = `
          <div class="fc-realtor-row" style="background:#f7f5f1;padding:10px;border-radius:14px;border:1px solid #e8e5de;">
            <div class="fc-avatar" style="background:#8a8f98;width:30px;height:30px;font-size:11px">${name[0].toUpperCase()}</div>
            <div><div class="fc-rl-name" style="font-size:12px">${name}</div><div class="fc-rl-sub">Закреплено за риэлтором агентства</div></div>
          </div>
          <button class="fc-fix-btn taken" data-listing="${l.id}" disabled>В базу — занято коллегой</button>`;
      } else if (isArch && isTaken) {
        const c = l.claimedBy;
        const ratingStr = c.rating ? ` <span class="fc-rl-rating">★ ${c.rating.toFixed(1)}</span>` : '';
        ownerBottom = `
          <div class="fc-realtor-row" style="background:#f7f5f1;padding:10px;border-radius:14px;border:1px solid #e8e5de;">
            <div class="fc-avatar" style="background:${c.color};width:30px;height:30px;font-size:11px">${c.initial}</div>
            <div><div class="fc-rl-name" style="font-size:12px">${c.name}${ratingStr}</div><div class="fc-rl-sub">Закреплено за риэлтором · ${c.date}</div></div>
          </div>
          <button class="fc-fix-btn taken" data-listing="${l.id}" disabled>В базу — занято коллегой</button>`;
      } else {
        ownerBottom = `
          <div class="fc-phone-row" data-listing="${l.id}">
            <div>
              <div class="fc-ph-lbl">Собственник · нажмите чтобы узнать номер</div>
              <div class="fc-ph-num hidden-num" data-phone="${l.ownerPhone}"></div>
            </div>
            <div class="fc-call">${iconPhone()}</div>
          </div>
          <button class="fc-fix-btn ${isMine ? 'mine' : 'free'}" data-listing="${l.id}">${isMine ? '✓ Вы взяли в работу' : 'В базу'}</button>`;
      }
    }

    const inbaseBadge = isArch
      ? `<div class="fc-badge arch-tag">Архив · снято ${l.removedDate}</div>`
      : `<div class="fc-badge owner-tag">Хозяин</div>`;

    // editData: фото и описание от агента; если агент ещё не грузил своё —
    // показываем фото с krisha (хотлинк на их CDN, у нас ничего не хранится)
    const claimData = this.state.claimed[l.id];
    const ed = (claimData && typeof claimData === 'object' && claimData.editData) ? claimData.editData : {};
    const firstPhoto = (ed.photos && ed.photos.length > 0) ? ed.photos[0]
                      : (l.photos && l.photos.length > 0) ? l.photos[0]
                      : null;
    const desc = ed.desc || '';

    return `
    <div class="feed-card" data-listing="${l.id}" style="position:relative;">
      <!-- Price section -->
      <div class="fc-price-section">
        <div class="fc-price-row">
          <div class="fc-price">${l.priceLabel} <span class="fc-cur">₸</span></div>
          ${pm2 ? `<div class="fc-pm2">${pm2.toLocaleString('ru')} ₸/м²</div>` : ''}
          ${diff !== null ? `<div class="fc-market ${diffClass}">${diffLabel}</div>` : ''}
          ${sparkline(l.priceHistory)}
        </div>
        <div class="fc-status-row">
          ${isNew ? `<div class="fc-chip-new">НОВОЕ</div>` : ''}
          ${timeAgoStr ? `<div class="fc-time-ago">${timeAgoStr}</div>` : ''}
        </div>
      </div>
      <!-- Photo -->
      <div class="fc-photo" style="${firstPhoto ? '' : `background:${l.photoBg}`}${isArch ? ';filter:saturate(.25) brightness(.9)' : ''}">
        ${firstPhoto ? `<img class="fc-photo-img" src="${firstPhoto}" loading="lazy" alt="">` : roomScene(l.scene)}
        <button class="fc-bookmark-btn${this.state.saved[l.id] ? ' on' : ''}" data-listing="${l.id}" aria-label="Сохранить">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${this.state.saved[l.id] ? 'white' : 'none'}" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
        </button>
      </div>
      <!-- Content -->
      <div class="fc-content">
        <div class="fc-badges-row">
          ${inbaseBadge}
          <div class="fc-badge id">${l.id}</div>
          <div class="fc-counter">${index+1} / ${total}</div>
        </div>
        <div class="fc-address">${l.address}</div>
        <div class="fc-meta">${metaText}</div>
        ${desc ? `<div class="fc-desc">${desc.length > 110 ? desc.slice(0, 110) + '…' : desc}</div>` : ''}
        ${ownerBottom}
        <div class="fc-stats-row">
          ${l.rooms !== null && l.rooms !== undefined ? `<div class="fc-stat"><div class="fc-stat-num">${l.rooms || 'С'}</div><div class="fc-stat-lbl">${l.rooms === 0 ? 'студ.' : 'комн.'}</div></div>` : ''}
          ${l.area  ? `<div class="fc-stat"><div class="fc-stat-num">${l.area}</div><div class="fc-stat-lbl">м²</div></div>` : ''}
          ${l.floor && l.floors ? `<div class="fc-stat"><div class="fc-stat-num">${l.floor}/${l.floors}</div><div class="fc-stat-lbl">этаж</div></div>` : ''}
        </div>
        <div class="fc-share-row">
          <a href="https://wa.me/?text=${encodeURIComponent(`${l.priceLabel} ₸${l.rooms != null ? ` · ${l.rooms || 'С'} комн.` : ''}${l.area ? ` · ${l.area} м²` : ''}\n${l.address}\nhttps://aituanze.github.io/cloud/`)}" target="_blank" class="fc-share-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.099.546 4.07 1.5 5.789L0 24l6.335-1.477A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.6a9.6 9.6 0 01-4.896-1.344l-.352-.21-3.624.845.895-3.52-.23-.367A9.6 9.6 0 012.4 12 9.6 9.6 0 0112 2.4 9.6 9.6 0 0121.6 12 9.6 9.6 0 0112 21.6z"/></svg>
            Отправить клиенту
          </a>
        </div>
      </div>
      <div class="fc-swipe-hint">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
        <span style="font-size:9px;font-weight:600">листать</span>
      </div>
    </div>`;
  },

  // ──────────────────────────────────────
  // MY BASE
  // ──────────────────────────────────────
  bindBaseSeg() {
    document.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        this.state.activeSeg = btn.dataset.seg;
        this.renderBase();
      });
    });
  },

  renderBase() {
    const scroll = document.getElementById('baseScroll');
    const seg = this.state.activeSeg;
    const ids = seg === 'claimed' ? Object.keys(this.state.claimed) : Object.keys(this.state.saved);

    const sub = document.getElementById('baseSubtitle');
    if (sub) sub.textContent = `${ids.length} ${pluralObj(ids.length)}`;

    document.getElementById('statClaimed').textContent = Object.keys(this.state.claimed).length;
    document.getElementById('statSaved').textContent   = Object.keys(this.state.saved).length;

    if (!ids.length) {
      const title = seg === 'claimed' ? 'Нет объектов в работе' : 'Нет сохранённых объектов';
      const hint  = seg === 'claimed' ? 'Нажмите «В базу» на карточке объекта' : 'В ленте нажмите закладку';
      scroll.innerHTML = `<div class="base-empty">
        <div class="base-empty-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9fa6b2" stroke-width="2" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
        <div class="base-empty-title">${title}</div>
        <div class="base-empty-sub">${hint}</div>
      </div>`;
      return;
    }

    scroll.innerHTML = ids.map(id => {
      const l = LISTINGS.find(x => x.id === id);
      if (!l) return '';
      const claim = this.state.claimed[id];
      const serial    = (claim && typeof claim === 'object' && claim.serial) ? claim.serial : '—';
      const claimedAt = (claim && typeof claim === 'object' && claim.claimedAt) ? claim.claimedAt : '';
      const ed = (claim && typeof claim === 'object' && claim.editData) ? claim.editData : {};
      const firstPhoto = (ed.photos && ed.photos.length > 0) ? ed.photos[0]
                        : (l.photos && l.photos.length > 0) ? l.photos[0]
                        : null;
      const descSnip = ed.desc ? (ed.desc.length > 65 ? ed.desc.slice(0, 65) + '…' : ed.desc) : '';
      const isArch = l.mode === 'archive';
      const statusLabel = isArch ? 'Архивный' : 'Активный';
      const statusClass = isArch ? 'arch' : 'taken';
      const photoStyle = firstPhoto
        ? `background: url('${firstPhoto}') center/cover no-repeat`
        : `background:${l.photoBg}`;
      const agentName = currentAgentName();
      const agentInitial = agentName[0].toUpperCase();
      return `<div class="base-card" data-listing="${l.id}">
        <div class="base-card-photo" style="${photoStyle};"></div>
        <div class="base-card-body">
          <div class="bc-top">
            <span class="bc-serial">${serial}</span>
            <span class="bc-date">${formatClaimedAt(claimedAt)}</span>
          </div>
          <div class="bc-agent-row">
            <span class="bc-agent-avatar">${agentInitial}</span>
            <span class="bc-agent-name">${agentName}</span>
            <span class="bc-agent-lbl">· МОП</span>
          </div>
          <div class="bc-price-row">
            <span class="bc-price">${l.priceLabel} ₸</span>
            <span class="bc-status ${statusClass}">${statusLabel}</span>
          </div>
          <div class="bc-addr">${l.address}</div>
          <div class="bc-meta">
            ${l.rooms !== null && l.rooms !== undefined ? `<span class="bc-chip">${l.rooms || 'С'} комн.</span>` : ''}
            ${l.area ? `<span class="bc-chip">${l.area} м²</span>` : ''}
            ${l.buildingType ? `<span class="bc-chip">${l.buildingType}</span>` : ''}
            ${firstPhoto ? `<span class="bc-chip bc-chip-photo">📷 ${((ed.photos && ed.photos.length) ? ed.photos : (l.photos || [])).length} фото</span>` : ''}
          </div>
          ${descSnip ? `<div class="bc-desc">${descSnip}</div>` : ''}
          <div class="bc-actions-row">
            <button class="bc-edit-btn" data-listing="${l.id}">Редактировать →</button>
            ${l.url ? `<a href="${l.url}" target="_blank" rel="noopener" class="bc-source-btn" onclick="event.stopPropagation()">Источник ↗</a>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');

    scroll.querySelectorAll('.bc-edit-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.openEditListing(btn.dataset.listing);
      });
    });
  },

  openEditListing(listingId) {
    const l = LISTINGS.find(x => x.id === listingId);
    if (!l) return;
    this._editingId = listingId;
    const claim = this.state.claimed[listingId];
    const ed = (claim && typeof claim === 'object' && claim.editData) ? claim.editData : {};
    const serial = (claim && typeof claim === 'object') ? (claim.serial || l.id) : l.id;

    document.getElementById('edSerial').textContent = serial;

    document.getElementById('edPrice').value      = ed.price    ?? (l.price    ?? '');
    document.getElementById('edArea').value       = ed.area     ?? (l.area     ?? '');
    document.getElementById('edFloor').value      = ed.floor    ?? (l.floor    ?? '');
    document.getElementById('edFloors').value     = ed.floors   ?? (l.floors   ?? '');
    document.getElementById('edAddress').value    = ed.address  ?? (l.address  ?? '');
    document.getElementById('edOwnerPhone').value = ed.ownerPhone ?? (l.ownerPhone ?? '');
    document.getElementById('edDesc').value       = ed.desc     ?? '';
    document.getElementById('edOwnerName').value  = ed.ownerName ?? '';

    this._setChip('edCategory',  ed.type      || l.type  || 'apt');
    this._setChip('edRooms',     String(ed.rooms !== undefined && ed.rooms !== null ? ed.rooms : (l.rooms ?? '')));
    this._setChip('edBuildType', ed.buildType || l.material || '');
    this._setChip('edCondition', ed.condition || '');

    this._renderEditPhotos(ed.photos || [], listingId);

    const scr = document.getElementById('edScroll');
    if (scr) scr.scrollTop = 0;

    document.getElementById('edSaveBtn').onclick = () => this.saveEditListing(listingId);
    document.getElementById('edRemoveBtn').onclick = () => {
      if (!confirm('Снять объект с работы?')) return;
      const removed = this.state.claimed[listingId];
      delete this.state.claimed[listingId];
      AgentRating.recordAbandon();
      localStorage.setItem('24s_claimed', JSON.stringify(this.state.claimed));
      if (removed?.supabaseId && window._agentProfile) {
        Sb.upsertProperty({ id: removed.supabaseId, status: 'archived' }).catch(console.error);
      }
      slideBack();
      this.renderBase();
    };

    slideForward('screen-base', 'screen-edit-listing');
  },

  saveEditListing(listingId) {
    const claim = this.state.claimed[listingId];
    if (!claim || typeof claim !== 'object') return;
    const existingPhotos = (claim.editData && claim.editData.photos) ? claim.editData.photos : [];
    claim.editData = {
      type:       document.querySelector('#edCategory .ed-chip.on')?.dataset.val  || null,
      rooms:      document.querySelector('#edRooms .ed-chip.on')?.dataset.val     || null,
      buildType:  document.querySelector('#edBuildType .ed-chip.on')?.dataset.val || null,
      condition:  document.querySelector('#edCondition .ed-chip.on')?.dataset.val || null,
      price:      Number(document.getElementById('edPrice').value)  || null,
      area:       Number(document.getElementById('edArea').value)   || null,
      floor:      Number(document.getElementById('edFloor').value)  || null,
      floors:     Number(document.getElementById('edFloors').value) || null,
      address:    document.getElementById('edAddress').value.trim(),
      desc:       document.getElementById('edDesc').value.trim(),
      ownerName:  document.getElementById('edOwnerName').value.trim(),
      ownerPhone: document.getElementById('edOwnerPhone').value.trim(),
      photos:     existingPhotos,
    };
    localStorage.setItem('24s_claimed', JSON.stringify(this.state.claimed));
    const ed = claim.editData;
    if (ed.photos.length >= 3 && ed.desc && ed.desc.length > 20 && ed.price) {
      AgentRating.recordCompletedListing(listingId);
    }
    if (!window._agentProfile) {
      // Объект сохранён только локально (claim и сам не мог быть создан без
      // входа после фикса выше, но старые локальные claim'ы из-за прежнего
      // бага могли остаться без supabaseId) — не врём "Сохранено ✓".
      this._toast('Сохранено локально — войдите как агент, чтобы объект попал в «Мои объекты»');
      return;
    }
    this._syncClaimToSupabase(listingId);
    this._toast('Сохранено ✓');
  },

  // Отражает объект «В базе» в общей таблице Supabase properties, чтобы он
  // был закреплён за агентом+агентством по-настоящему, а не только в
  // localStorage телефона, и появлялся сгруппированным на экране «Мои объекты».
  async _syncClaimToSupabase(listingId) {
    if (!window._agentProfile) return; // не авторизован в Supabase — работаем локально
    const claim = this.state.claimed[listingId];
    const l = LISTINGS.find(x => x.id === listingId);
    if (!claim || !l) return;
    const ed = claim.editData || {};
    // l.type использует коды парсера (apt/house/land/comm/dacha) — Supabase
    // ждёт 'commercial' вместо 'comm' (см. supabase/mop_transfers.sql про dacha).
    const TYPE_DB_MAP = { comm: 'commercial' };
    const rawType = ed.type ?? l.type;
    const payload = {
      id:               claim.supabaseId || crypto.randomUUID(),
      agency_id:        window._agentProfile.agency_id,
      agent_id:         window._agentProfile.id,
      source_krisha_id: l.id,
      type:             TYPE_DB_MAP[rawType] || rawType,
      district:         l.district,
      address:          ed.address   || l.address,
      price:            ed.price     ?? l.price,
      price_label:      l.priceLabel || null,
      area:             ed.area      ?? l.area,
      rooms:            ed.rooms     ?? l.rooms,
      floor:            ed.floor     ?? l.floor,
      floors:           ed.floors    ?? l.floors,
      building_type:    ed.buildType || l.buildingType,
      description:      ed.desc      || null,
      owner_name:       ed.ownerName || null,
      owner_phone:      ed.ownerPhone || l.ownerPhone || null,
      photos:           ed.photos && ed.photos.length ? ed.photos : l.photos || [],
      status:           'draft',
      updated_at:       new Date().toISOString(),
    };
    try {
      const saved = await Sb.upsertProperty(payload);
      if (saved?.id && !claim.supabaseId) {
        claim.supabaseId = saved.id;
        localStorage.setItem('24s_claimed', JSON.stringify(this.state.claimed));
      }
    } catch (err) {
      // 23505 = нарушение uq_properties_agency_krisha (supabase/prevent_duplicate_claims.sql) —
      // коллега успел взять этот же krisha-объект первым в гонке. Откатываем локально.
      if (err?.code === '23505' && !claim.supabaseId) {
        delete this.state.claimed[listingId];
        localStorage.setItem('24s_claimed', JSON.stringify(this.state.claimed));
        this._toast('Уже занято коллегой — убрано из вашей базы');
        this._loadAgencyClaims();
      } else {
        console.error('Sync claim → Supabase failed', err);
        this._toast('Не удалось сохранить объект в базу — попробуйте ещё раз');
      }
    }
  },

  // Claim'ы, сделанные ДО фикса выше (когда кнопка "В базу" ещё не требовала
  // входа) — остались только в localStorage без supabaseId и никогда не
  // попадали в «Мои объекты». Досылаем их в Supabase сразу после входа.
  _syncPendingClaims() {
    Object.keys(this.state.claimed).forEach(id => {
      const claim = this.state.claimed[id];
      if (claim && typeof claim === 'object' && !claim.supabaseId) {
        this._syncClaimToSupabase(id);
      }
    });
  },

  _setChip(groupId, val) {
    const grp = document.getElementById(groupId);
    if (!grp) return;
    grp.querySelectorAll('.ed-chip').forEach(c => c.classList.toggle('on', c.dataset.val === val));
  },

  _toast(msg) {
    let t = document.getElementById('appToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'appToast';
      Object.assign(t.style, {
        position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)',
        background: '#1a1a2e', color: '#fff', padding: '10px 22px',
        borderRadius: '20px', fontSize: '13px', fontWeight: '700',
        zIndex: '9999', transition: 'opacity .3s', pointerEvents: 'none',
        whiteSpace: 'nowrap',
      });
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2000);
  },

  initEditScreen() {
    document.querySelectorAll('#screen-edit-listing .ed-chips').forEach(group => {
      group.addEventListener('click', e => {
        const chip = e.target.closest('.ed-chip');
        if (!chip) return;
        group.querySelectorAll('.ed-chip').forEach(c => c.classList.remove('on'));
        chip.classList.add('on');
      });
    });
    document.getElementById('edBackBtn').addEventListener('click', () => slideBack());

    document.getElementById('edFileInput').addEventListener('change', async e => {
      const files = Array.from(e.target.files);
      e.target.value = '';
      if (!files.length || !this._editingId) return;
      const claim = this.state.claimed[this._editingId];
      if (!claim || typeof claim !== 'object') return;
      if (!claim.editData) claim.editData = {};
      if (!claim.editData.photos) claim.editData.photos = [];
      for (const file of files) {
        if (claim.editData.photos.length >= 5) break;
        const compressed = await this.compressImage(file);
        claim.editData.photos.push(compressed);
      }
      localStorage.setItem('24s_claimed', JSON.stringify(this.state.claimed));
      this._renderEditPhotos(claim.editData.photos, this._editingId);
    });
  },

  compressImage(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const MAX = 900;
          const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
          const w = Math.round(img.width * ratio);
          const h = Math.round(img.height * ratio);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.72));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  _renderEditPhotos(photos, listingId) {
    const container = document.getElementById('edPhotos');
    if (!container) return;
    const addTile = photos.length < 5 ? `
      <div class="ed-photo-add" id="edPhotoAdd">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9fa6b2" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Добавить фото</span>
      </div>` : '';
    container.innerHTML = photos.map((src, i) =>
      `<div class="ed-thumb">
        <img src="${src}" class="ed-thumb-img" loading="lazy">
        <button class="ed-thumb-rm" data-idx="${i}">×</button>
      </div>`
    ).join('') + addTile;

    container.querySelectorAll('.ed-thumb-rm').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (!confirm('Удалить это фото?')) return;
        const idx = parseInt(btn.dataset.idx);
        const claim = this.state.claimed[listingId];
        if (claim && claim.editData && claim.editData.photos) {
          claim.editData.photos.splice(idx, 1);
          localStorage.setItem('24s_claimed', JSON.stringify(this.state.claimed));
          this._renderEditPhotos(claim.editData.photos, listingId);
        }
      });
    });

    const addBtn = container.querySelector('#edPhotoAdd');
    if (addBtn) addBtn.addEventListener('click', () => document.getElementById('edFileInput').click());
  },

  renderProfile() {
    document.getElementById('statClaimed').textContent = Object.keys(this.state.claimed).length;
    document.getElementById('statSaved').textContent   = Object.keys(this.state.saved).length;
    const cards = document.querySelectorAll('.stat-card');
    if (cards[0]) cards[0].onclick = () => { this.state.activeSeg = 'claimed'; this.switchTab('base'); };
    if (cards[1]) cards[1].onclick = () => { this.state.activeSeg = 'saved';   this.switchTab('base'); };

    const avatarEl  = document.querySelector('.profile-avatar');
    const nameEl    = document.querySelector('.profile-name');
    const companyEl = document.querySelector('.profile-company');
    const subBadge  = document.querySelector('.sub-badge');
    const headerRow = document.querySelector('.profile-row');

    if (window._agentProfile) {
      const p = window._agentProfile;
      const initial = (p.name || 'А')[0].toUpperCase();
      if (avatarEl) avatarEl.textContent = initial;
      if (nameEl)   nameEl.textContent   = p.name || 'Агент';
      if (subBadge) subBadge.style.display = '';
      if (headerRow) { headerRow.onclick = null; headerRow.style.cursor = ''; }
    } else {
      // Гость: не показываем чужое имя/фейковую подписку — честно предлагаем войти
      if (avatarEl)  avatarEl.textContent = '?';
      if (nameEl)    nameEl.textContent   = 'Войти как агент';
      if (companyEl) companyEl.textContent = 'agnt.24 · Алматы';
      if (subBadge)  subBadge.style.display = 'none';
      if (headerRow) { headerRow.onclick = () => Auth.showAgentLogin(); headerRow.style.cursor = 'pointer'; }
    }

    this.renderRatingCard();
    TransferUI.refreshMopCard();
    HierarchyUI.refreshCards();
  },

  renderRatingCard() {
    const r = AgentRating.compute();
    document.getElementById('ratingValue').textContent = r.stars.toFixed(1);

    const badge = document.getElementById('ratingTierBadge');
    badge.textContent = r.tier.label;
    badge.className = `rating-tier-badge tier-${r.tier.id}`;

    document.getElementById('ratingSub').textContent =
      `${r.dealsCount} ${pluralObj(r.dealsCount)} в работе · дисциплина ${r.discipline}%`;

    const fill = document.getElementById('ratingProgressFill');
    fill.style.width = `${Math.round(r.progress * 100)}%`;

    const lbl = document.getElementById('ratingProgressLbl');
    if (r.nextTier) {
      const parts = [];
      if (r.dealsToNext > 0)  parts.push(`${r.dealsToNext} ${pluralObj(r.dealsToNext)}`);
      if (r.ratingToNext > 0) parts.push(`рейтинг +${r.ratingToNext.toFixed(1)}`);
      lbl.textContent = parts.length
        ? `До «${r.nextTier.label}»: ${parts.join(' · ')}`
        : `Уровень «${r.nextTier.label}» открыт — обновится при следующей сделке`;
    } else {
      lbl.textContent = 'Максимальный уровень достигнут';
    }

    document.getElementById('ratingPerks').innerHTML = r.tier.perks.map(p => `
      <div class="rating-perk">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        ${p}
      </div>`).join('');
  },
};

// ── NAVIGATION HELPERS ──────────────────
const _navStack = []; // { fromId, tabBarVisible }
let _suppressPop = false;

// Android back button — никогда не выходить из приложения
// Два entry в истории: replaceState + pushState — чтобы было куда вернуться
history.replaceState({ idx: 0 }, '');
history.pushState({ idx: 0 }, '');
window.addEventListener('popstate', () => {
  if (_suppressPop) { _suppressPop = false; return; }
  history.pushState({ idx: _navStack.length }, ''); // не выходить
  if (_navStack.length === 0) return;
  const { fromId, tabBarVisible } = _navStack.pop();
  const active = document.querySelector('.screen.active');
  if (active) { active.classList.remove('active'); active.classList.add('slide-below'); }
  const prev = document.getElementById(fromId);
  if (prev) { prev.classList.remove('slide-below', 'slide-above'); prev.classList.add('active'); }
  const tb = document.getElementById('tabBar');
  if (tabBarVisible) tb.classList.remove('hidden'); else tb.classList.add('hidden');
});

function slideForward(fromId, toId) {
  const from = document.getElementById(fromId);
  const to   = document.getElementById(toId);
  if (!from || !to) return;
  const tb = document.getElementById('tabBar');
  _navStack.push({ fromId, tabBarVisible: !tb.classList.contains('hidden') });
  history.pushState({ idx: _navStack.length }, '');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  from.classList.add('slide-above');
  to.classList.remove('slide-below', 'slide-above');
  to.classList.add('active');
  setTimeout(() => from.classList.remove('slide-above'), 420);
}

function slideBack(fromId, toId) {
  const from = document.getElementById(fromId || (document.querySelector('.screen.active') || {}).id);
  const last = _navStack.length > 0 ? _navStack.pop() : null;
  const toScreen = toId || last?.fromId;
  const to = document.getElementById(toScreen);
  if (!to) return;
  if (from) { from.classList.remove('active'); from.classList.add('slide-below'); }
  to.classList.remove('slide-below', 'slide-above'); to.classList.add('active');
  const tb = document.getElementById('tabBar');
  if (toId) {
    // явный toId — вызывающий код сам управляет видимостью tab bar
  } else if (last?.tabBarVisible) {
    tb.classList.remove('hidden');
  } else {
    tb.classList.add('hidden');
  }
  _suppressPop = true;
  history.back();
}

// ── HELPERS ──────────────────────────────
function formatClaimedAt(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw; // старые записи — просто дата строкой (без времени)
  const datePart = d.toLocaleDateString('ru');
  const timePart = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  return `${datePart}, ${timePart}`;
}

function currentAgentName() {
  return (window._agentProfile && window._agentProfile.name) || 'Вы';
}

const YEAR_BUCKET_ORDER = ['old', '2000s', '2010s', 'new'];
const YEAR_BUCKET_LABELS = { old: 'до 2000', '2000s': '2000–2009', '2010s': '2010–2019', new: '2020+' };

function yearBucket(yearBuilt) {
  if (!yearBuilt) return null;
  if (yearBuilt < 2000) return 'old';
  if (yearBuilt < 2010) return '2000s';
  if (yearBuilt < 2020) return '2010s';
  return 'new';
}

function pluralObj(n) {
  const m = n % 100;
  if (m >= 11 && m <= 19) return 'объектов';
  const e = n % 10;
  if (e === 1) return 'объект';
  if (e >= 2 && e <= 4) return 'объекта';
  return 'объектов';
}

function iconPhone() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.91a16 16 0 006.18 6.18l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>`;
}

// Мини-график динамики цены объявления (история из price_history пайплайна).
// history — массив цен в хронологическом порядке, минимум 2 точки.
function sparkline(history) {
  if (!history || history.length < 2) return '';
  const w = 44, h = 16, pad = 2;
  const min = Math.min(...history), max = Math.max(...history);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (history.length - 1);
  const points = history.map((p, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((p - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const rising = history[history.length - 1] > history[0];
  const falling = history[history.length - 1] < history[0];
  const color = falling ? '#15966b' : rising ? '#c0392b' : '#8a8f98'; // дешевле = зелёным (выгодно покупателю)
  return `<svg class="fc-sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" title="История цены">
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function typeIcon(typeId) {
  const icons = {
    apt:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="9"/></svg>`,
    house: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>`,
    land:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    comm:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>`,
    dacha: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><line x1="12" y1="2" x2="12" y2="5"/></svg>`,
  };
  return icons[typeId] || icons.apt;
}

function roomScene(scene) {
  const warm = `<svg class="room-svg" viewBox="0 0 430 700" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <rect x="60" y="80" width="310" height="210" rx="6" fill="rgba(200,230,255,0.3)"/>
    <polygon points="65,260 130,160 185,200 235,140 285,180 340,120 365,160 365,285 65,285" fill="rgba(100,160,200,0.4)"/>
    <polygon points="65,275 120,230 170,255 220,210 270,240 320,195 365,220 365,285 65,285" fill="rgba(80,140,180,0.5)"/>
    <rect x="0" y="420" width="430" height="280" fill="rgba(120,85,50,0.4)"/>
    <g stroke="rgba(90,60,30,0.3)" stroke-width="1.5"><line x1="0" y1="450" x2="430" y2="450"/><line x1="0" y1="490" x2="430" y2="490"/><line x1="70" y1="420" x2="70" y2="560"/><line x1="150" y1="420" x2="150" y2="560"/><line x1="230" y1="420" x2="230" y2="560"/><line x1="310" y1="420" x2="310" y2="560"/></g>
    <rect x="40" y="365" width="250" height="70" rx="12" fill="rgba(70,50,35,0.7)"/>
    <rect x="340" y="300" width="88" height="140" rx="6" fill="rgba(40,28,18,0.65)"/>
    <rect x="347" y="312" width="74" height="96" rx="4" fill="rgba(20,25,40,0.8)"/>
  </svg>`;
  const cool = `<svg class="room-svg" viewBox="0 0 430 700" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <rect x="40" y="60" width="350" height="240" rx="5" fill="rgba(180,210,235,0.25)"/>
    <polygon points="45,270 100,190 160,220 220,160 290,195 350,140 385,175 385,298 45,298" fill="rgba(120,175,215,0.35)"/>
    <rect x="0" y="430" width="430" height="270" fill="rgba(55,75,100,0.35)"/>
    <rect x="30" y="350" width="160" height="100" rx="5" fill="rgba(30,55,80,0.7)"/>
    <rect x="205" y="340" width="220" height="120" rx="10" fill="rgba(40,60,80,0.6)"/>
  </svg>`;
  const green = `<svg class="room-svg" viewBox="0 0 430 700" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <rect x="80" y="50" width="270" height="200" rx="5" fill="rgba(190,225,195,0.25)"/>
    <polygon points="85,225 140,160 200,188 265,140 330,170 345,185 345,248 85,248" fill="rgba(110,175,120,0.38)"/>
    <rect x="0" y="420" width="430" height="280" fill="rgba(60,85,60,0.4)"/>
    <rect x="20" y="328" width="130" height="90" rx="4" fill="rgba(35,55,35,0.65)"/>
    <rect x="258" y="295" width="160" height="125" rx="5" fill="rgba(30,50,30,0.7)"/>
  </svg>`;
  const archWarm = `<svg class="room-svg" viewBox="0 0 430 700" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <rect x="60" y="80" width="310" height="210" rx="6" fill="rgba(170,190,205,0.22)"/>
    <polygon points="65,260 130,160 185,200 235,140 285,180 340,120 365,160 365,285 65,285" fill="rgba(130,155,170,0.35)"/>
    <rect x="0" y="420" width="430" height="280" fill="rgba(75,68,60,0.4)"/>
  </svg>`;
  const archCool = `<svg class="room-svg" viewBox="0 0 430 700" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <rect x="40" y="60" width="350" height="240" rx="5" fill="rgba(150,170,185,0.2)"/>
    <polygon points="45,270 100,190 160,220 220,160 290,195 350,140 385,175 385,298 45,298" fill="rgba(105,130,148,0.3)"/>
    <rect x="0" y="430" width="430" height="270" fill="rgba(45,55,70,0.35)"/>
  </svg>`;

  const map = { warm, cool, green, 'arch-warm': archWarm, 'arch-cool': archCool };
  return map[scene] || warm;
}

// ── LIVE SYNC ────────────────────────────
// Новые объекты с krisha.kz попадают в data/listings.js через pipeline.py
// (парсер → build_app_data.py). Периодически перечитываем файл, чтобы числа
// на карте/в районе обновлялись без ручной перезагрузки приложения —
// «появился новый объект в Бостандыкском, было 10, стало 11».
const LIVE_SYNC_INTERVAL_MS = 120000; // 2 минуты

async function pollForFreshListings() {
  try {
    const res = await fetch('data/listings.js?t=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      const text = await res.text();
      const listingsMatch  = text.match(/const LISTINGS=(\[.*\]);/s);
      const districtsMatch = text.match(/const DISTRICTS=(\[.*?\]);/s);

      if (listingsMatch) {
        const freshListings  = JSON.parse(listingsMatch[1]);
        const freshDistricts = districtsMatch ? JSON.parse(districtsMatch[1]) : null;

        if (freshListings.length !== LISTINGS.length) {
          // Мутируем массивы на месте — они объявлены const в listings.js,
          // переприсвоить биндинг нельзя, но содержимое можно.
          LISTINGS.length = 0;
          LISTINGS.push(...freshListings);
          if (freshDistricts) {
            DISTRICTS.length = 0;
            DISTRICTS.push(...freshDistricts);
          }

          App.precomputeAvgPrices();
          App.renderMap();
          if (document.getElementById('screen-district').classList.contains('active')) {
            App.renderDistrictGrid();
          }
          if (document.getElementById('screen-filter').classList.contains('active')) {
            App.renderFilterContent();
          }
        }
      }
    }
  } catch (e) {
    // тихо игнорируем — обновим на следующем тике
  }
  // Реальные claims агентства держим свежими тем же интервалом — чтобы
  // красная/зелёная лампочка не отставала от того, что взяли коллеги.
  // (важно: это должно выполняться на КАЖДОМ тике, независимо от того,
  // изменилось ли число объявлений — claim коллеги не трогает listings.js)
  if (window._agentProfile) App._loadAgencyClaims();
}

// ── BOOT ─────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  Auth.bind();
  InviteFlow.bind();
  HierarchyUI.init();
  App.init(); // Карта всегда работает без авторизации
  setInterval(pollForFreshListings, LIVE_SYNC_INTERVAL_MS);

  // Приглашение по ссылке (?invite=) — показываем форму регистрации до всего остального
  if (await InviteFlow.checkUrl()) return;

  // Авторизация проверяется в фоне и не блокирует UI
  const session = await Sb.getSession();
  if (!session) return; // анонимный пользователь — карта работает

  const agentProfile = await Sb.getProfile(session.user.id);
  if (agentProfile) {
    window._agentProfile = agentProfile;
    AgentProperties.init(agentProfile);
    AgentCrm.init(agentProfile);
    TransferUI.init();
    App._loadAgencyClaims();
    App._syncPendingClaims();
  } else {
    const buyerProfile = await Sb.getBuyerProfile(session.user.id);
    if (buyerProfile) {
      window._buyerProfile = buyerProfile;
    } else {
      console.warn('Сессия есть (uid=' + session.user.id + '), но профиль не найден ни в profiles, ни в buyer_profiles.');
    }
  }
});
