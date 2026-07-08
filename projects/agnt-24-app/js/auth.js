// Auth — агентский email-логин + покупательский phone OTP
const Auth = {
  _otpSuccessCb: null,

  showAgentLogin() {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.classList.add('slide-below');
    });
    document.getElementById('screen-auth').classList.remove('slide-below');
    document.getElementById('screen-auth').classList.add('active');
    document.getElementById('tabBar').classList.add('hidden');
  },

  showPhoneOTP(onSuccess) {
    this._otpSuccessCb = onSuccess;
    document.getElementById('otpPhoneStep').style.display = '';
    document.getElementById('otpCodeStep').style.display  = 'none';
    document.getElementById('otpError').style.display     = 'none';
    document.getElementById('otpPhone').value = '';
    document.getElementById('otpCode').value  = '';
    document.getElementById('otpTitle').textContent = 'Введите номер телефона';
    document.getElementById('otpSub').textContent   = 'Чтобы увидеть контакт агента';
    document.getElementById('screen-phone-otp').classList.remove('slide-below');
    document.getElementById('screen-phone-otp').classList.add('active');
  },

  hidePhoneOTP() {
    document.getElementById('screen-phone-otp').classList.add('slide-below');
    document.getElementById('screen-phone-otp').classList.remove('active');
  },

  async signOut() {
    await Sb.auth.signOut();
    location.reload();
  },

  _showError(elId, msg) {
    const el = document.getElementById(elId);
    el.textContent = msg;
    el.style.display = 'block';
  },

  _normalizePhone(raw) {
    const digits = raw.replace(/\D/g, '');
    if (raw.startsWith('+')) return '+' + digits;
    return '+7' + digits.slice(-10);
  },

  bind() {
    // ── Агент: войти ─────────────────────────
    document.getElementById('authSubmit').addEventListener('click', async () => {
      const email = document.getElementById('authEmail').value.trim();
      const pass  = document.getElementById('authPassword').value;
      document.getElementById('authError').style.display = 'none';
      if (!email || !pass) { this._showError('authError', 'Введите email и пароль'); return; }
      const btn = document.getElementById('authSubmit');
      btn.textContent = 'Входим...'; btn.disabled = true;
      const { error } = await Sb.auth.signInWithPassword({ email, password: pass });
      btn.textContent = 'Войти'; btn.disabled = false;
      if (error) { this._showError('authError', 'Неверный email или пароль'); return; }
      location.reload();
    });

    // ── Покупатель: к ленте без авторизации ──
    document.getElementById('authBuyerBtn').addEventListener('click', () => {
      BuyerFeed.show();
    });

    // ── OTP: отправить код ────────────────────
    document.getElementById('otpSendBtn').addEventListener('click', async () => {
      const phone = this._normalizePhone(document.getElementById('otpPhone').value.trim());
      document.getElementById('otpError').style.display = 'none';
      const btn = document.getElementById('otpSendBtn');
      btn.textContent = 'Отправляем...'; btn.disabled = true;
      const { error } = await Sb.auth.signInWithOtp({ phone });
      btn.textContent = 'Получить код'; btn.disabled = false;
      if (error) { this._showError('otpError', 'Не удалось отправить SMS: ' + error.message); return; }
      document.getElementById('otpPhoneStep').style.display = 'none';
      document.getElementById('otpCodeStep').style.display  = '';
      document.getElementById('otpTitle').textContent = 'Введите код из SMS';
      document.getElementById('otpSub').textContent   = `Код отправлен на ${phone}`;
    });

    // ── OTP: подтвердить ─────────────────────
    document.getElementById('otpVerifyBtn').addEventListener('click', async () => {
      const phone = this._normalizePhone(document.getElementById('otpPhone').value.trim());
      const token = document.getElementById('otpCode').value.trim();
      const btn = document.getElementById('otpVerifyBtn');
      btn.textContent = 'Проверяем...'; btn.disabled = true;
      const { data, error } = await Sb.auth.verifyOtp({ phone, token, type: 'sms' });
      btn.textContent = 'Подтвердить'; btn.disabled = false;
      if (error) { this._showError('otpError', 'Неверный код'); return; }

      await Sb.db.from('buyer_profiles')
        .upsert({ id: data.user.id, phone: data.user.phone })
        .select();

      this.hidePhoneOTP();
      if (this._otpSuccessCb) this._otpSuccessCb(data.user);
    });

    // ── OTP: назад ───────────────────────────
    document.getElementById('otpSkipBtn').addEventListener('click', () => this.hidePhoneOTP());

    // ── Выйти (экран профиля) ─────────────────
    const signOutRow = document.querySelector('.sr-signout');
    if (signOutRow) signOutRow.addEventListener('click', () => this.signOut());

    // ── Уведомления (push) ────────────────────
    const notifRow = document.getElementById('notifSettingsRow');
    if (notifRow) notifRow.addEventListener('click', () => Push.toggle());

    // ── Строки-заглушки (фича не реализована) — были кликабельны по виду
    // (стрелка-шеврон), но без единого обработчика вообще, тап не делал
    // ничего и не сообщал об этом пользователю.
    ['subSettingsRow', 'myProfileRow'].forEach(id => {
      const row = document.getElementById(id);
      if (row) row.addEventListener('click', () => App._toast('Скоро'));
    });
  },
};
