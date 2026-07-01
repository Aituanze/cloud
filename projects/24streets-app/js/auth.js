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

  showAgencySetup() {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.classList.add('slide-below');
    });
    document.getElementById('screen-agency-setup').classList.remove('slide-below');
    document.getElementById('screen-agency-setup').classList.add('active');
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

    // ── Регистрация агентства ─────────────────
    document.getElementById('authToSetup').addEventListener('click', () => this.showAgencySetup());
    document.getElementById('setupToLogin').addEventListener('click', () => this.showAgentLogin());

    document.getElementById('setupSubmit').addEventListener('click', async () => {
      const agencyName = document.getElementById('setupAgencyName').value.trim();
      const adminName  = document.getElementById('setupAdminName').value.trim();
      const email      = document.getElementById('setupEmail').value.trim();
      const password   = document.getElementById('setupPassword').value;
      document.getElementById('setupError').style.display = 'none';

      if (!agencyName || !adminName || !email || password.length < 6) {
        this._showError('setupError', 'Заполните все поля (пароль мин. 6 символов)'); return;
      }
      const btn = document.getElementById('setupSubmit');
      btn.textContent = 'Создаём...'; btn.disabled = true;

      // Попробуем войти — вдруг аккаунт уже есть
      let uid;
      const { data: tryLogin } = await Sb.auth.signInWithPassword({ email, password });
      if (tryLogin?.user) {
        uid = tryLogin.user.id;
      } else {
        const { data: signUpData, error: signUpError } = await Sb.auth.signUp({ email, password });
        if (signUpError) {
          this._showError('setupError', signUpError.message);
          btn.textContent = 'Создать агентство'; btn.disabled = false;
          return;
        }
        uid = signUpData.user?.id;
        // Если сессии нет — email-подтверждение ещё не выключено, логинимся вручную
        if (!signUpData.session) {
          const { data: si, error: siErr } = await Sb.auth.signInWithPassword({ email, password });
          if (siErr || !si?.user) {
            this._showError('setupError', 'Включи «Confirm email» OFF в Supabase → Auth → Providers → Email');
            btn.textContent = 'Создать агентство'; btn.disabled = false;
            return;
          }
          uid = si.user.id;
        }
      }

      // Проверим — нет ли уже профиля у этого пользователя
      const existing = await Sb.getProfile(uid);
      if (existing) {
        // Уже есть профиль — просто входим
        location.reload();
        return;
      }

      // id генерируем на клиенте, чтобы не читать строку обратно через .select()
      // (RLS-политика чтения agencies ещё не пропустит новую строку — профиль-связка появится ниже)
      const agencyId = crypto.randomUUID();
      const { error: agencyError } = await Sb.db
        .from('agencies').insert({ id: agencyId, name: agencyName });
      if (agencyError) {
        this._showError('setupError', 'Ошибка БД: ' + agencyError.message);
        btn.textContent = 'Создать агентство'; btn.disabled = false;
        return;
      }

      const { error: profErr } = await Sb.db.from('profiles').insert({
        id: uid, agency_id: agencyId, role: 'admin', name: adminName,
      });
      if (profErr) {
        this._showError('setupError', 'Ошибка профиля: ' + profErr.message);
        btn.textContent = 'Создать агентство'; btn.disabled = false;
        return;
      }

      location.reload();
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
  },
};
