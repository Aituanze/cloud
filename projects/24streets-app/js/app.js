/* ─────────────────────────────────────────
   24Streets App — core logic
───────────────────────────────────────── */

const App = {
  state: {
    mode: 'sale',
    district: null,
    type: 'apt',
    priceFrom: 0,
    priceTo: 200000000,
    claimed: JSON.parse(localStorage.getItem('24s_claimed') || '{}'),
    saved:   JSON.parse(localStorage.getItem('24s_saved')   || '{}'),
    revealed: {},
    activeSeg: 'claimed', // 'claimed' | 'saved'
    currentTab: 'map',    // 'map' | 'base' | 'profile'
  },

  init() {
    this.renderMap();
    this.bindMap();
    this.bindBottomPanel();
    this.bindTrioToggle();
    this.bindPriceModal();
    this.bindTabBar();
    this.bindBaseSeg();
    this.updateFindCount();
  },

  // ──────────────────────────────────────
  // TAB BAR
  // ──────────────────────────────────────

  bindTabBar() {
    document.querySelectorAll('.tab-item').forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.dataset.tab;
        if (tab === 'feed') this.openFeed();
        else this.switchTab(tab);
      });
    });
  },

  switchTab(tab) {
    const tabScreens = { map: 'screen-map', base: 'screen-base', profile: 'screen-profile' };
    if (tab === this.state.currentTab) return;

    document.querySelectorAll('.tab-item').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
    const prev = tabScreens[this.state.currentTab];
    const next = tabScreens[tab];
    this.state.currentTab = tab;

    const prevEl = document.getElementById(prev);
    const nextEl = document.getElementById(next);
    if (prevEl) { prevEl.classList.remove('active'); prevEl.classList.add('slide-below'); }
    if (nextEl) { nextEl.classList.remove('slide-below','slide-above'); nextEl.classList.add('active'); }

    if (tab === 'base') this.renderBase();
    if (tab === 'profile') this.renderProfile();
  },

  // ──────────────────────────────────────
  // MAP
  // ──────────────────────────────────────

  renderMap() {
    const svg = document.getElementById('mapSvg');
    const isArch = this.state.mode === 'archive';

    DISTRICTS.forEach(d => {
      const g = svg.querySelector(`[data-district="${d.id}"]`);
      if (!g) return;
      const count = isArch ? d.arch : d.count;
      const mainCircle = g.querySelector('.bubble-main');
      const countText  = g.querySelector('.bubble-count');
      const isSelected = this.state.district === d.id;

      if (isArch) {
        // Archive: hollow circles
        mainCircle.setAttribute('fill', 'white');
        mainCircle.setAttribute('stroke', d.color);
        mainCircle.setAttribute('stroke-width', '2.5');
        mainCircle.setAttribute('stroke-dasharray', '4,3');
        g.querySelector('.bubble-count').setAttribute('fill', d.color);
        g.querySelector('.bubble-name').setAttribute('fill', '#9fa6b2');
      } else {
        // Active: solid circles
        mainCircle.setAttribute('fill', isSelected ? d.color : d.color);
        mainCircle.setAttribute('stroke', isSelected ? 'white' : 'none');
        mainCircle.setAttribute('stroke-width', isSelected ? '2.5' : '0');
        mainCircle.removeAttribute('stroke-dasharray');
        g.querySelector('.bubble-count').setAttribute('fill', 'white');
        g.querySelector('.bubble-name').setAttribute('fill', 'rgba(255,255,255,0.85)');
      }

      if (countText) countText.textContent = count;

      // Selection glow ring
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
        ring.setAttribute('cx', d.cx);
        ring.setAttribute('cy', d.cy);
        ring.setAttribute('r', d.r + 7);
      } else if (ring) {
        ring.remove();
      }
    });

    // Live dot
    const liveDot = document.querySelector('.live-dot');
    if (liveDot) liveDot.classList.toggle('muted', isArch);

    // Live counter
    const counter = document.getElementById('liveCount');
    if (counter) {
      const total = DISTRICTS.reduce((s,d) => s + (isArch ? d.arch : d.count), 0);
      counter.textContent = isArch
        ? `${total.toLocaleString('ru')} архив.`
        : `${total} сейчас`;
    }

    // Archive date strip
    const strip = document.getElementById('archDateStrip');
    if (strip) strip.classList.toggle('visible', isArch);
  },

  bindMap() {
    const svg = document.getElementById('mapSvg');
    svg.querySelectorAll('.bubble-g').forEach(g => {
      g.addEventListener('click', () => {
        const id = g.dataset.district;
        this.state.district = id;
        this.renderMap();
        this.updateFindCount();
        setTimeout(() => this.openFeed(), 140);
      });
    });
  },

  bindBottomPanel() {
    // Type chips
    document.querySelectorAll('.type-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.type-chip').forEach(c => c.classList.remove('on'));
        chip.classList.add('on');
        this.state.type = chip.dataset.type;
        this.updateFindCount();
      });
    });

    // Find button
    document.getElementById('findBtn').addEventListener('click', () => {
      this.openFeed();
    });
  },

  bindTrioToggle() {
    document.querySelectorAll('.trio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.trio-btn').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        this.state.mode = btn.dataset.mode;
        if (this.state.mode === 'archive') {
          this.state.district = null; // reset selection
        }
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

  getFilteredListings() {
    return LISTINGS.filter(l => {
      if (this.state.mode === 'archive' && l.mode !== 'archive') return false;
      if (this.state.mode !== 'archive' && l.mode === 'archive') return false;
      if (this.state.district && l.district !== this.state.district) return false;
      if (l.type !== this.state.type) return false;
      if (l.price < this.state.priceFrom || l.price > this.state.priceTo) return false;
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
    const from = this.state.priceFrom;
    const to   = this.state.priceTo;
    fromEl.textContent = from > 0   ? `${Math.round(from/1000000)} млн` : 'любая';
    toEl.textContent   = to < 200e6 ? `${Math.round(to/1000000)} млн`  : 'любая';
  },

  // ──────────────────────────────────────
  // FEED
  // ──────────────────────────────────────

  openFeed() {
    const listings = this.getFilteredListings();
    if (!listings.length) return;

    const districtName = this.state.district
      ? DISTRICTS.find(d => d.id === this.state.district)?.name
      : 'Все районы';

    this.renderFeed(listings, districtName);
    transitionTo('screen-feed');
    document.querySelectorAll('.tab-item').forEach(t => t.classList.toggle('on', t.dataset.tab === 'feed'));
    this.state.currentTab = 'feed';
  },

  renderFeed(listings, districtName) {
    const wrapper = document.getElementById('feedWrapper');
    wrapper.innerHTML = '';

    listings.forEach((l, i) => {
      const card = this.buildCard(l, i, listings.length, districtName, i === 0);
      wrapper.insertAdjacentHTML('beforeend', card);
    });

    // Bind card interactions
    wrapper.querySelectorAll('.back-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        wrapper.scrollTop = 0;
        transitionTo('screen-map');
        document.querySelectorAll('.tab-item').forEach(t => t.classList.toggle('on', t.dataset.tab === 'map'));
        App.state.currentTab = 'map';
      });
    });

    wrapper.querySelectorAll('.fix-btn[data-listing]').forEach(btn => {
      btn.addEventListener('click', () => this.toggleClaim(btn));
    });

    wrapper.querySelectorAll('.phone-reveal').forEach(el => {
      el.addEventListener('click', () => this.revealPhone(el));
    });

    wrapper.querySelectorAll('.act-save').forEach(btn => {
      const circle = btn.querySelector('.act-circle');
      const card = btn.closest('.feed-card');
      const id = card?.dataset.listing;
      // Restore saved state
      if (id && this.state.saved[id]) circle.classList.add('saved');
      btn.addEventListener('click', () => {
        if (!id) return;
        circle.classList.toggle('saved');
        if (circle.classList.contains('saved')) this.state.saved[id] = true;
        else delete this.state.saved[id];
        localStorage.setItem('24s_saved', JSON.stringify(this.state.saved));
      });
    });

    // Update counter on scroll
    wrapper.addEventListener('scroll', () => {
      const cardH = wrapper.clientHeight;
      const idx = Math.round(wrapper.scrollTop / cardH);
      wrapper.querySelectorAll('.card-counter').forEach((el, i) => {
        el.textContent = `${i+1} / ${listings.length}`;
        el.style.opacity = i === idx ? '1' : '0';
        el.style.pointerEvents = i === idx ? 'auto' : 'none';
      });
    }, { passive: true });
  },

  buildCard(l, index, total, districtName, isFirst) {
    const isArch = l.mode === 'archive';
    const isMine = this.state.claimed[l.id] === 'mine';
    const isTaken = l.claimedBy && !isMine;
    const progress = ((index + 1) / total * 100).toFixed(1);
    const typeLabel = { sale:'Продажа', rent:'Аренда', archive:'Архив' }[l.mode] || '';
    const typeChip  = TYPES.find(t => t.id === l.type)?.label || '';

    let photoClass = isArch ? 'card-photo arch-filter' : 'card-photo';
    let roomSvg = roomScene(l.scene);

    let bottomContent = '';
    if (!isArch) {
      bottomContent = `
        <div class="realtor-row">
          <div class="rl-left">
            <div class="avatar" style="background:${l.realtor.color}">${l.realtor.initial}</div>
            <div>
              <div class="rl-name">${l.realtor.name}</div>
              <div class="rl-meta">
                <span class="star" style="color:#ffd93d">★</span>
                ${l.realtor.rating} · ${l.realtor.deals} сделок
              </div>
            </div>
          </div>
          <div class="contact-btn">Связаться</div>
        </div>`;
    } else if (isTaken) {
      const c = l.claimedBy;
      bottomContent = `
        <div class="colleague-row">
          <div class="avatar" style="background:${c.color}">${c.initial}</div>
          <div class="col-info">
            <div class="col-lbl">Взяла в работу ${c.date}</div>
            <div class="col-name">${c.name}</div>
          </div>
          <div class="call-circle orange">
            ${iconPhone()}
          </div>
        </div>
        <button class="fix-btn taken" data-listing="${l.id}" disabled>В базу — занято коллегой</button>`;
    } else {
      const claimState = isMine ? 'mine' : 'free';
      const claimLabel = isMine ? '✓ Вы взяли в работу' : 'В базу';
      bottomContent = `
        <div class="phone-row phone-reveal" data-listing="${l.id}">
          <div>
            <div class="ph-lbl">Собственник · нажмите чтобы узнать номер</div>
            <div class="ph-num hidden" data-phone="${l.ownerPhone}">+7 ··· ··· ·· ··</div>
          </div>
          <div class="call-circle">${iconPhone()}</div>
        </div>
        <button class="fix-btn ${claimState}" data-listing="${l.id}">${claimLabel}</button>`;
    }

    const sellerBadge = isArch
      ? `<div class="badge seller-own">👤 Хозяин</div>`
      : `<div class="badge seller-agent">🏢 Агент</div>`;

    const buildingBadge = l.buildingType
      ? `<div class="badge btype">${l.buildingType}</div>`
      : '';

    const statusDot = isArch
      ? `<div class="sdot ${isTaken ? 'taken' : 'free'}"></div>`
      : `<div class="badge inbase"><div class="dot"></div>В базе</div>`;

    const priceSection = isArch
      ? `<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px;">
           <div class="card-price" style="color:rgba(210,200,185,.82);font-size:22px;">${l.priceLabel} <span class="cur">₸</span></div>
           <span class="price-was">была цена</span>
         </div>`
      : `<div class="card-price">${l.priceLabel} <span class="cur">₸</span></div>`;

    return `
    <div class="feed-card" data-listing="${l.id}">
      <div class="${photoClass}" style="background:${l.photoBg}">
        ${roomSvg}
      </div>
      <div class="card-progress"><div class="card-progress-fill" style="width:${progress}%"></div></div>
      <div class="card-sb">
        <span class="time">9:41</span>
        <div class="icons">
          <svg width="13" height="9" viewBox="0 0 20 14" fill="white" opacity=".8"><rect x="0" y="4" width="3" height="10" rx="1"/><rect x="4.5" y="2.5" width="3" height="11.5" rx="1"/><rect x="9" y="0.5" width="3" height="13.5" rx="1"/></svg>
        </div>
      </div>
      ${isArch ? `<div class="arch-banner"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>АРХИВ · снято ${l.removedDate}</div>` : ''}
      <div class="card-top-left" style="${isArch ? 'top:calc(var(--safe-top) + 52px)' : ''}">
        <div class="back-btn">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </div>
        <div>
          <div class="card-title">${districtName}</div>
          <div class="card-subtitle">${typeChip} · ${typeLabel}</div>
        </div>
      </div>
      <div class="card-counter" style="${isArch ? 'top:calc(var(--safe-top) + 54px)' : ''}">${index+1} / ${total}</div>
      ${!isArch ? `
      <div class="card-actions">
        <div class="act-item act-save">
          <div class="act-circle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round"><path d="M17 3H7a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2z"/></svg>
          </div>
          <span class="act-lbl">Сохранить</span>
        </div>
        <div class="act-item">
          <div class="act-circle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          </div>
          <span class="act-lbl">Поделиться</span>
        </div>
      </div>` : ''}
      <div class="card-btm">
        <div class="badges-row">
          ${statusDot}
          ${sellerBadge}
          ${buildingBadge}
          <div class="badge id-badge">${l.id}</div>
        </div>
        ${priceSection}
        <div class="card-address">${l.address}</div>
        <div class="meta-row">
          ${l.rooms ? `<div class="meta-chip">${l.rooms} комн.</div>` : ''}
          ${l.area  ? `<div class="meta-chip">${l.area} м²</div>` : ''}
          ${l.material ? `<div class="meta-chip">${l.material}</div>` : ''}
          ${l.floor ? `<div class="meta-chip">${l.floor}/${l.floors} эт.</div>` : ''}
          ${l.year  ? `<div class="meta-chip">${l.year} г.</div>` : ''}
        </div>
        ${bottomContent}
      </div>
      <div class="swipe-hint">
        <svg class="swipe-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
        <span class="swipe-txt">листать</span>
      </div>
    </div>`;
  },

  toggleClaim(btn) {
    const id = btn.dataset.listing;
    if (!id) return;
    const isMine = this.state.claimed[id] === 'mine';
    if (isMine) {
      delete this.state.claimed[id];
      btn.className = 'fix-btn free';
      btn.textContent = 'В базу';
    } else {
      this.state.claimed[id] = 'mine';
      btn.className = 'fix-btn mine';
      btn.textContent = '✓ Вы взяли в работу';
    }
    localStorage.setItem('24s_claimed', JSON.stringify(this.state.claimed));
  },

  revealPhone(el) {
    const numEl = el.querySelector('.ph-num');
    if (!numEl) return;
    const phone = numEl.dataset.phone;
    if (!phone) return;
    if (numEl.classList.contains('hidden')) {
      numEl.textContent = phone;
      numEl.classList.remove('hidden');
      // Auto-update label
      const lbl = el.querySelector('.ph-lbl');
      if (lbl) lbl.textContent = 'Собственник · Казахстан';
    }
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
    let ids, emptyTitle, emptySub;

    if (seg === 'claimed') {
      ids = Object.keys(this.state.claimed);
      emptyTitle = 'Нет объектов в работе';
      emptySub = 'Перейдите в Архив и нажмите\n«В базу» на объекте';
    } else {
      ids = Object.keys(this.state.saved);
      emptyTitle = 'Нет сохранённых объектов';
      emptySub = 'В ленте нажмите иконку закладки\nчтобы сохранить объект';
    }

    const sub = document.getElementById('baseSubtitle');
    if (sub) sub.textContent = `${ids.length} ${pluralObj(ids.length)}`;

    document.getElementById('statClaimed').textContent = Object.keys(this.state.claimed).length;
    document.getElementById('statSaved').textContent   = Object.keys(this.state.saved).length;

    if (!ids.length) {
      scroll.innerHTML = `
        <div class="base-empty">
          <div class="base-empty-ico">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9fa6b2" stroke-width="2" stroke-linecap="round">
              ${seg === 'claimed'
                ? '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
                : '<path d="M17 3H7a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2z"/>'}
            </svg>
          </div>
          <div class="base-empty-title">${emptyTitle}</div>
          <div class="base-empty-sub">${emptySub}</div>
        </div>`;
      return;
    }

    const cards = ids.map(id => {
      const l = LISTINGS.find(x => x.id === id);
      if (!l) return '';
      const isArch = l.mode === 'archive';
      const statusLabel = seg === 'claimed'
        ? (isArch ? 'Архивный' : 'Активный')
        : 'Сохранён';
      const statusClass = seg === 'claimed'
        ? (isArch ? 'arch' : 'taken')
        : 'saved';
      return `
        <div class="base-card" data-listing="${l.id}">
          <div class="base-card-photo" style="background:${l.photoBg};">
            ${isArch ? '<div class="arch-overlay"></div>' : ''}
          </div>
          <div class="base-card-body">
            <div>
              <div class="bc-top">
                <span class="bc-price">${l.priceLabel} ₸</span>
                <span class="bc-id">${l.id}</span>
              </div>
              <div class="bc-addr">${l.address}</div>
              <div class="bc-meta">
                ${l.rooms ? `<span class="bc-chip">${l.rooms} комн.</span>` : ''}
                ${l.area ? `<span class="bc-chip">${l.area} м²</span>` : ''}
                ${l.material ? `<span class="bc-chip">${l.material}</span>` : ''}
              </div>
            </div>
            <div class="bc-status ${statusClass}">${statusLabel}</div>
          </div>
        </div>`;
    }).join('');

    scroll.innerHTML = cards || '<div class="base-empty"><div class="base-empty-title">Объекты не найдены</div></div>';
  },

  renderProfile() {
    document.getElementById('statClaimed').textContent = Object.keys(this.state.claimed).length;
    document.getElementById('statSaved').textContent   = Object.keys(this.state.saved).length;
    const cards = document.querySelectorAll('.stat-card');
    if (cards[0]) cards[0].onclick = () => { this.state.activeSeg = 'claimed'; this.switchTab('base'); };
    if (cards[1]) cards[1].onclick = () => { this.state.activeSeg = 'saved';   this.switchTab('base'); };
  },
};

// ── HELPERS ──────────────────────────────

function transitionTo(screenId) {
  const screens = document.querySelectorAll('.screen');
  const target  = document.getElementById(screenId);
  const current = document.querySelector('.screen.active');

  if (!target || target === current) return;

  const forward = screenId === 'screen-feed';
  screens.forEach(s => {
    if (s === current) s.classList.add(forward ? 'slide-above' : 'slide-below');
    else if (s === target) { s.classList.remove('slide-below','slide-above'); }
    s.classList.remove('active');
  });
  target.classList.add('active');

  // cleanup
  setTimeout(() => {
    screens.forEach(s => { if (s !== target) s.classList.remove('slide-above','slide-below'); });
  }, 420);
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
  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.91a16 16 0 006.18 6.18l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>`;
}

function roomScene(scene) {
  const warm = `
    <svg class="room-svg" viewBox="0 0 430 700" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <rect x="60" y="80" width="310" height="210" rx="6" fill="rgba(200,230,255,0.3)"/>
      <polygon points="65,260 130,160 185,200 235,140 285,180 340,120 365,160 365,285 65,285" fill="rgba(100,160,200,0.4)"/>
      <polygon points="65,275 120,230 170,255 220,210 270,240 320,195 365,220 365,285 65,285" fill="rgba(80,140,180,0.5)"/>
      <rect x="0" y="420" width="430" height="280" fill="rgba(120,85,50,0.4)"/>
      <g stroke="rgba(90,60,30,0.3)" stroke-width="1.5">
        <line x1="0" y1="450" x2="430" y2="450"/><line x1="0" y1="490" x2="430" y2="490"/>
        <line x1="0" y1="530" x2="430" y2="530"/>
        <line x1="70" y1="420" x2="70" y2="560"/><line x1="150" y1="420" x2="150" y2="560"/>
        <line x1="230" y1="420" x2="230" y2="560"/><line x1="310" y1="420" x2="310" y2="560"/>
      </g>
      <rect x="40" y="365" width="250" height="70" rx="12" fill="rgba(70,50,35,0.7)"/>
      <rect x="40" y="350" width="250" height="26" rx="10" fill="rgba(80,58,40,0.75)"/>
      <rect x="50" y="352" width="68" height="55" rx="8" fill="rgba(100,72,50,0.5)"/>
      <rect x="128" y="352" width="68" height="55" rx="8" fill="rgba(100,72,50,0.5)"/>
      <rect x="206" y="352" width="76" height="55" rx="8" fill="rgba(100,72,50,0.5)"/>
      <rect x="90" y="428" width="145" height="40" rx="8" fill="rgba(90,65,38,0.5)"/>
      <rect x="340" y="300" width="88" height="140" rx="6" fill="rgba(40,28,18,0.65)"/>
      <rect x="347" y="312" width="74" height="96" rx="4" fill="rgba(20,25,40,0.8)"/>
    </svg>`;
  const cool = `
    <svg class="room-svg" viewBox="0 0 430 700" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <rect x="40" y="60" width="350" height="240" rx="5" fill="rgba(180,210,235,0.25)"/>
      <polygon points="45,270 100,190 160,220 220,160 290,195 350,140 385,175 385,298 45,298" fill="rgba(120,175,215,0.35)"/>
      <polygon points="45,285 90,250 150,270 210,230 270,258 330,215 385,240 385,300 45,300" fill="rgba(95,155,200,0.45)"/>
      <rect x="0" y="430" width="430" height="270" fill="rgba(55,75,100,0.35)"/>
      <rect x="0" y="320" width="430" height="30" fill="rgba(180,200,220,0.15)"/>
      <rect x="30" y="350" width="160" height="100" rx="5" fill="rgba(30,55,80,0.7)"/>
      <rect x="32" y="358" width="156" height="60" rx="3" fill="rgba(15,30,55,0.85)"/>
      <rect x="205" y="340" width="220" height="120" rx="10" fill="rgba(40,60,80,0.6)"/>
      <rect x="215" y="352" width="200" height="96" rx="8" fill="rgba(45,68,95,0.7)"/>
      <line x1="315" y1="340" x2="315" y2="460" stroke="rgba(100,140,175,0.3)" stroke-width="1.5"/>
    </svg>`;
  const green = `
    <svg class="room-svg" viewBox="0 0 430 700" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <rect x="80" y="50" width="270" height="200" rx="5" fill="rgba(190,225,195,0.25)"/>
      <polygon points="85,225 140,160 200,188 265,140 330,170 345,185 345,248 85,248" fill="rgba(110,175,120,0.38)"/>
      <polygon points="85,238 125,210 190,232 250,198 310,225 345,208 345,250 85,250" fill="rgba(90,155,100,0.48)"/>
      <rect x="0" y="420" width="430" height="280" fill="rgba(60,85,60,0.4)"/>
      <rect x="0" y="300" width="430" height="28" fill="rgba(60,80,60,0.5)"/>
      <rect x="20" y="328" width="130" height="90" rx="4" fill="rgba(35,55,35,0.65)"/>
      <rect x="165" y="310" width="80" height="108" rx="8" fill="rgba(45,65,45,0.6)"/>
      <rect x="258" y="295" width="160" height="125" rx="5" fill="rgba(30,50,30,0.7)"/>
    </svg>`;

  const archWarm = `
    <svg class="room-svg" viewBox="0 0 430 700" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <rect x="60" y="80" width="310" height="210" rx="6" fill="rgba(170,190,205,0.22)"/>
      <polygon points="65,260 130,160 185,200 235,140 285,180 340,120 365,160 365,285 65,285" fill="rgba(130,155,170,0.35)"/>
      <rect x="0" y="420" width="430" height="280" fill="rgba(75,68,60,0.4)"/>
      <rect x="40" y="365" width="250" height="70" rx="12" fill="rgba(50,46,40,0.65)"/>
      <rect x="50" y="352" width="68" height="55" rx="8" fill="rgba(65,60,52,0.5)"/>
      <rect x="128" y="352" width="68" height="55" rx="8" fill="rgba(65,60,52,0.5)"/>
      <rect x="206" y="352" width="76" height="55" rx="8" fill="rgba(65,60,52,0.5)"/>
    </svg>`;
  const archCool = `
    <svg class="room-svg" viewBox="0 0 430 700" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <rect x="40" y="60" width="350" height="240" rx="5" fill="rgba(150,170,185,0.2)"/>
      <polygon points="45,270 100,190 160,220 220,160 290,195 350,140 385,175 385,298 45,298" fill="rgba(105,130,148,0.3)"/>
      <rect x="0" y="430" width="430" height="270" fill="rgba(45,55,70,0.35)"/>
      <rect x="30" y="350" width="160" height="100" rx="5" fill="rgba(28,40,58,0.65)"/>
      <rect x="205" y="340" width="220" height="120" rx="10" fill="rgba(35,48,65,0.55)"/>
    </svg>`;

  const map = { warm, cool, green, 'arch-warm': archWarm, 'arch-cool': archCool };
  return map[scene] || warm;
}

// ── BOOT ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
