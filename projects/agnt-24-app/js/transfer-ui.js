// Передача объекта коллеге + подтверждение МОП/админом
const TransferUI = {
  _pickerPropertyId: null,
  _pickerFromScreen: null,

  init() {
    document.getElementById('edTransferBtn')?.addEventListener('click', () => {
      const claim = App.state.claimed[App._editingId];
      if (!claim?.supabaseId) {
        App._toast('Объект ещё не синхронизирован — сохраните изменения и попробуйте снова');
        return;
      }
      this.openPicker(claim.supabaseId, 'screen-edit-listing');
    });

    document.getElementById('peTransferBtn')?.addEventListener('click', () => {
      const prop = AgentProperties._editing;
      if (!prop?.id) return; // на новом черновике кнопка скрыта, но подстрахуемся
      this.openPicker(prop.id, 'screen-prop-editor');
    });

    document.getElementById('transferPickerBack')?.addEventListener('click', () => slideBack());
    document.getElementById('transfersBack')?.addEventListener('click', () => slideBack());

    document.getElementById('mopTransfersCard')?.addEventListener('click', () => {
      slideForward('screen-profile', 'screen-transfers');
      document.getElementById('tabBar').classList.add('hidden');
      this.renderTransfersList();
    });
  },

  // Показывает карточку "Заявки на перенос" только МОП/админу и обновляет счётчик
  async refreshMopCard() {
    const card = document.getElementById('mopTransfersCard');
    if (!card) return;
    const role = window._agentProfile?.role;
    if (role !== 'mop' && role !== 'admin') { card.style.display = 'none'; return; }
    card.style.display = '';
    try {
      const pending = await Sb.getPendingTransfers();
      document.getElementById('mopTransfersCount').textContent =
        `${pending.length} ${pending.length === 1 ? 'ожидает' : 'ожидают'}`;
    } catch (err) {
      console.error('refreshMopCard', err);
    }
  },

  async openPicker(propertyId, fromScreenId) {
    this._pickerPropertyId = propertyId;
    this._pickerFromScreen = fromScreenId;
    const list = document.getElementById('transferPickerList');
    list.innerHTML = '<div class="prop-empty">Загрузка…</div>';
    slideForward(fromScreenId, 'screen-transfer-picker');

    const p = window._agentProfile;
    const colleagues = p ? await Sb.getAgencyAgents(p.agency_id, p.id) : [];
    if (!colleagues.length) {
      list.innerHTML = '<div class="prop-empty">В агентстве больше нет других агентов</div>';
      return;
    }
    list.innerHTML = colleagues.map(c => `
      <div class="colleague-row" data-id="${c.id}">
        <div class="colleague-avatar">${(c.name || '?')[0].toUpperCase()}</div>
        <div class="colleague-name">${c.name || 'Без имени'}</div>
      </div>`).join('');

    list.querySelectorAll('.colleague-row').forEach(row => {
      row.addEventListener('click', async () => {
        if (!confirm(`Передать объект этому коллеге? Перенос вступит в силу после подтверждения МОП.`)) return;
        try {
          await Sb.requestTransfer(this._pickerPropertyId, p.id, row.dataset.id);
          App._toast('Заявка на перенос отправлена ✓');
          slideBack();
        } catch (err) {
          console.error('requestTransfer', err);
          alert('Не удалось отправить заявку: ' + (err.message || err));
        }
      });
    });
  },

  async renderTransfersList() {
    const list = document.getElementById('transfersList');
    list.innerHTML = '<div class="prop-empty">Загрузка…</div>';
    let requests = [];
    try {
      requests = await Sb.getPendingTransfers();
    } catch (err) {
      console.error('getPendingTransfers', err);
    }
    if (!requests.length) {
      list.innerHTML = '<div class="prop-empty">Нет заявок на перенос</div>';
      return;
    }
    list.innerHTML = requests.map(r => `
      <div class="transfer-req-card" data-id="${r.id}">
        <div class="transfer-req-addr">${r.properties?.address || '—'} · ${r.properties?.price_label || ''} ₸</div>
        <div class="transfer-req-sub">${r.from?.name || '?'} → ${r.to?.name || '?'}</div>
        <div class="transfer-req-actions">
          <button class="tr-approve">Подтвердить</button>
          <button class="tr-reject">Отклонить</button>
        </div>
      </div>`).join('');

    list.querySelectorAll('.transfer-req-card').forEach(card => {
      const id = card.dataset.id;
      card.querySelector('.tr-approve').addEventListener('click', () => this._decide(id, true));
      card.querySelector('.tr-reject').addEventListener('click', () => this._decide(id, false));
    });
  },

  async _decide(requestId, approve) {
    try {
      await Sb.decideTransfer(requestId, approve);
      App._toast(approve ? 'Перенос подтверждён ✓' : 'Заявка отклонена');
      this.renderTransfersList();
      this.refreshMopCard();
    } catch (err) {
      console.error('decideTransfer', err);
      alert('Не удалось обработать заявку: ' + (err.message || err));
    }
  },
};
