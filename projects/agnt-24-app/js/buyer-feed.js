// Лента покупателя — TikTok-скролл + contact gate
const BuyerFeed = {
  _props: [],
  _user:  null,

  async show() {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.classList.add('slide-below');
    });
    document.getElementById('screen-buyer-feed').classList.remove('slide-below');
    document.getElementById('screen-buyer-feed').classList.add('active');
    document.getElementById('tabBar').classList.add('hidden');

    const session = await Sb.getSession();
    this._user = session?.user || null;

    this._props = await Sb.getPublishedProperties(200);
    this._render();
  },

  _render() {
    const wrapper = document.getElementById('buyerFeedWrapper');
    wrapper.innerHTML  = '';
    wrapper.scrollTop  = 0;

    if (!this._props.length) {
      wrapper.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--ink2);font-size:14px;font-weight:500;text-align:center;padding:24px">Нет опубликованных объектов</div>';
      return;
    }

    this._props.forEach(p => {
      wrapper.insertAdjacentHTML('beforeend', this._cardHTML(p));
    });

    wrapper.querySelectorAll('.buyer-contact-btn').forEach(btn => {
      btn.addEventListener('click', () =>
        this._handleContact(btn, btn.dataset.propId, btn.dataset.agentId));
    });
  },

  _cardHTML(p) {
    const photo = p.photos?.[0]
      ? `<img src="${p.photos[0]}" alt="" style="width:100%;height:100%;object-fit:cover">`
      : `<div style="width:100%;height:100%;background:linear-gradient(145deg,#e8e4dc,#d4cfc7)"></div>`;

    const chips = [
      p.building_type,
      p.rooms != null ? `${p.rooms || 'С'} комн.` : null,
      p.area   ? `${p.area} м²` : null,
      (p.floor && p.floors) ? `${p.floor}/${p.floors} эт` : null,
    ].filter(Boolean).join(' · ');

    return `<div class="buyer-card">
      <div class="buyer-card-price-row">
        <div class="buyer-card-price">${p.price_label || ''} <span style="font-size:16px;font-weight:600">₸</span></div>
      </div>
      <div class="buyer-card-photo">${photo}</div>
      <div class="buyer-card-content">
        <div class="buyer-card-addr">${p.address || '—'}</div>
        <div class="buyer-card-meta">${chips}</div>
        <div class="buyer-card-stats">
          ${p.rooms != null ? `<div><div class="bstat-num">${p.rooms || 'С'}</div><div class="bstat-lbl">${p.rooms === 0 ? 'студ.' : 'комн.'}</div></div>` : ''}
          ${p.area  ? `<div><div class="bstat-num">${p.area}</div><div class="bstat-lbl">м²</div></div>` : ''}
          ${(p.floor && p.floors) ? `<div><div class="bstat-num">${p.floor}/${p.floors}</div><div class="bstat-lbl">этаж</div></div>` : ''}
        </div>
        <div id="buyer-contact-${p.id}">
          <button class="buyer-contact-btn" data-prop-id="${p.id}" data-agent-id="${p.agent_id}">
            Позвонить агенту
          </button>
        </div>
      </div>
    </div>`;
  },

  async _handleContact(btn, propId, agentId) {
    if (this._user) {
      await this._revealContact(propId, agentId);
      return;
    }
    Auth.showPhoneOTP(async user => {
      this._user = user;
      await this._revealContact(propId, agentId);
    });
  },

  async _revealContact(propId, agentId) {
    const { data: agentData } = await Sb.db
      .from('profiles')
      .select('phone, name')
      .eq('id', agentId)
      .single();

    const phone = agentData?.phone || '';
    const name  = agentData?.name  || 'Агент';
    const wa    = `https://wa.me/${phone.replace(/\D/g, '')}`;

    const container = document.getElementById(`buyer-contact-${propId}`);
    if (!container) return;

    container.innerHTML = `
      <div class="buyer-contact-revealed">
        <div>
          <div style="font-size:11px;color:var(--ink3);font-weight:600;margin-bottom:2px">${name}</div>
          <div class="buyer-contact-phone">${phone || '—'}</div>
        </div>
        <div style="display:flex;gap:8px">
          <a href="tel:${phone.replace(/\D/g,'')}" class="buyer-action-btn" style="background:var(--ink)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.91a16 16 0 006.18 6.18l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          </a>
          <a href="${wa}" target="_blank" class="buyer-action-btn" style="background:#25D366">WA</a>
        </div>
      </div>`;

    if (this._user) {
      try {
        await Sb.createLead(propId, agentId, this._user.id, phone || this._user.phone || null);
        // Push — best-effort: функция может быть ещё не задеплоена в Supabase,
        // создание лида не должно падать из-за этого.
        Sb.triggerPush(agentId, {
          title: 'Новый лид agnt.24',
          body: 'Покупатель посмотрел контакт по вашему объекту',
          url: './index.html',
          tag: `lead-${propId}`,
        }).catch(() => {});
      } catch (e) {
        // лид уже существует — OK
      }
    }
  },
};
