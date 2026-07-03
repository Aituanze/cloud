// Управление объектами агента
const TYPE_LABELS = { apt: 'Квартира', house: 'Дом', land: 'Участок', commercial: 'Коммерч.', dacha: 'Дача' };

const AgentProperties = {
  _profile: null,
  _props:   [],
  _editing: null,
  _photos:  [],

  init(profile) {
    this._profile = profile;
    const distSel = document.getElementById('peDistrict');
    if (distSel && !distSel.options.length) {
      distSel.innerHTML = DISTRICTS.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    }
    document.getElementById('propAddBtn')
      .addEventListener('click', () => this.openEditor(null));
    document.getElementById('propEditorBack')
      .addEventListener('click', () => slideBack());
    document.getElementById('propSaveBtn')
      .addEventListener('click', () => this._save(false));
    document.getElementById('propPublishBtn')
      .addEventListener('click', () => this._save(true));
    document.getElementById('pePhotoInput')
      .addEventListener('change', e => this._onPhotoPick(e));
    document.querySelectorAll('.pe-chip')
      .forEach(c => c.addEventListener('click', () => {
        document.querySelectorAll('.pe-chip').forEach(x => x.classList.remove('on'));
        c.classList.add('on');
      }));
  },

  // Вызывается из switchTab — только рендер, без навигации
  async renderList() {
    const all = await Sb.getAgentProperties(this._profile.id);
    this._props = all.filter(p => p.status !== 'archived');
    const list = document.getElementById('propList');

    if (!this._props.length) {
      list.innerHTML = '<div class="prop-empty">Нет объектов.<br>Нажмите + Добавить</div>';
      return;
    }

    list.innerHTML = this._groupedHtml(this._props);

    list.querySelectorAll('.prop-card').forEach(card => {
      card.addEventListener('click', () => {
        const p = this._props.find(x => x.id === card.dataset.id);
        if (p) this.openEditor(p);
      });
    });
  },

  _groupedHtml(props) {
    const districtName = id => DISTRICTS.find(d => d.id === id)?.name || 'Без района';
    const byDistrict = {};
    props.forEach(p => {
      const key = p.district || '__none';
      (byDistrict[key] ||= []).push(p);
    });

    return Object.keys(byDistrict)
      .sort((a, b) => districtName(a).localeCompare(districtName(b), 'ru'))
      .map(distKey => {
        const byType = {};
        byDistrict[distKey].forEach(p => {
          const t = p.type || 'apt';
          (byType[t] ||= []).push(p);
        });
        const typeBlocks = Object.keys(byType).map(t => `
          <div class="prop-type-label">${TYPE_LABELS[t] || t} · ${byType[t].length}</div>
          ${byType[t].map(p => this._cardHtml(p)).join('')}
        `).join('');
        return `<div class="prop-district-group">
          <div class="prop-district-label">${districtName(distKey)}</div>
          ${typeBlocks}
        </div>`;
      }).join('');
  },

  _cardHtml(p) {
    const thumb = p.photos?.[0]
      ? `<img class="prop-card-thumb" src="${p.photos[0]}" alt="">`
      : `<div class="prop-card-thumb prop-card-thumb-empty"></div>`;
    const statusLabel = { draft: 'Черновик', active: 'Опубликован', archived: 'Архив' }[p.status] || p.status;
    const price = p.price_label ? `${p.price_label} ₸` : '—';
    return `<div class="prop-card" data-id="${p.id}">
      ${thumb}
      <div class="prop-card-body">
        <div class="prop-card-price">${price}</div>
        <div class="prop-card-addr">${p.address || '—'}</div>
        <div class="prop-card-status ${p.status}">${statusLabel}</div>
      </div>
    </div>`;
  },

  openEditor(prop) {
    this._editing = prop;
    this._photos  = (prop?.photos || []).map(url => ({ url }));

    document.getElementById('propEditorTitle').textContent = prop ? 'Редактировать' : 'Новый объект';
    document.getElementById('peAddress').value    = prop?.address || '';
    const distSel = document.getElementById('peDistrict');
    if (distSel) distSel.value = prop?.district || DISTRICTS[0]?.id || '';
    document.getElementById('pePrice').value      = prop?.price   || '';
    document.getElementById('peArea').value       = prop?.area    || '';
    document.getElementById('peRooms').value      = prop?.rooms ?? '';
    document.getElementById('peFloor').value      = (prop?.floor && prop?.floors) ? `${prop.floor} / ${prop.floors}` : '';
    document.getElementById('peDesc').value       = prop?.description || '';
    document.getElementById('peOwnerName').value  = prop?.owner_name  || '';
    document.getElementById('peOwnerPhone').value = prop?.owner_phone || '';

    const currentType = prop?.type || 'apt';
    document.querySelectorAll('.pe-chip').forEach(c =>
      c.classList.toggle('on', c.dataset.val === currentType));

    const transferBtn = document.getElementById('peTransferBtn');
    if (transferBtn) transferBtn.style.display = prop ? '' : 'none';

    this._renderPhotos();

    // slideForward записывает tabBarVisible ДО скрытия — чтобы при возврате tab bar появился
    slideForward('screen-properties', 'screen-prop-editor');
    document.getElementById('tabBar').classList.add('hidden');
  },

  _renderPhotos() {
    const row    = document.getElementById('pePhotosRow');
    const addBtn = row.querySelector('.pe-photo-add');
    row.querySelectorAll('.pe-photo-tile').forEach(el => el.remove());

    this._photos.forEach((p, i) => {
      const tile = document.createElement('div');
      tile.className = 'pe-photo-tile';
      tile.innerHTML = `
        <img class="pe-photo-thumb" src="${p.url}">
        <button class="pe-photo-rm" type="button">×</button>`;
      tile.querySelector('.pe-photo-rm').addEventListener('click', e => {
        e.stopPropagation();
        if (!confirm('Удалить это фото?')) return;
        this._photos.splice(i, 1);
        this._renderPhotos();
      });
      row.insertBefore(tile, addBtn);
    });
  },

  _onPhotoPick(e) {
    const files = Array.from(e.target.files).slice(0, 10 - this._photos.length);
    files.forEach(file => this._photos.push({ url: URL.createObjectURL(file), file }));
    this._renderPhotos();
    e.target.value = '';
  },

  async _save(publish) {
    const pubBtn  = document.getElementById('propPublishBtn');
    const saveBtn = document.getElementById('propSaveBtn');
    pubBtn.textContent = 'Сохранение...'; pubBtn.disabled = true;
    saveBtn.disabled = true;

    try {
      const propId = this._editing?.id || crypto.randomUUID();

      const finalUrls = [];
      for (const p of this._photos) {
        if (p.file) {
          const url = await Sb.uploadPhoto(p.file, propId);
          finalUrls.push(url);
        } else {
          finalUrls.push(p.url);
        }
      }

      const floorRaw   = document.getElementById('peFloor').value.split('/').map(s => parseInt(s.trim()));
      const type       = document.querySelector('.pe-chip.on')?.dataset.val || 'apt';
      const price      = parseInt(document.getElementById('pePrice').value) || 0;
      const priceLabel = price >= 1000000
        ? `${(price / 1000000).toLocaleString('ru', { maximumFractionDigits: 1 })} млн`
        : price.toLocaleString('ru');

      const payload = {
        id:          propId,
        agency_id:   this._profile.agency_id,
        agent_id:    this._profile.id,
        type,
        district:    document.getElementById('peDistrict')?.value || null,
        address:     document.getElementById('peAddress').value.trim(),
        price,
        price_label: priceLabel,
        area:        parseFloat(document.getElementById('peArea').value)  || null,
        rooms:       parseInt(document.getElementById('peRooms').value)   || null,
        floor:       floorRaw[0] || null,
        floors:      floorRaw[1] || null,
        description: document.getElementById('peDesc').value.trim(),
        owner_name:  document.getElementById('peOwnerName').value.trim(),
        owner_phone: document.getElementById('peOwnerPhone').value.trim(),
        photos:      finalUrls,
        status:      publish ? 'active' : 'draft',
        published_at:publish ? new Date().toISOString() : (this._editing?.published_at || null),
        updated_at:  new Date().toISOString(),
      };

      await Sb.upsertProperty(payload);
      slideBack();
      await this.renderList();
    } finally {
      pubBtn.textContent = 'Опубликовать'; pubBtn.disabled = false;
      saveBtn.disabled = false;
    }
  },
};
