// Push-уведомления (Web Push) — подписка агента и хранение в Supabase.
// Отправка (Edge Function send-push) вызывается из buyer-feed.js при создании лида.
const Push = {
  VAPID_PUBLIC_KEY: 'BNVliQT8lNVX9YqCQamkOTsm_An2zSv21rVCtQslEIFkjtsWpmx0UFLWPnYZwcKbYRINBh46nEcOVFts9RpuD-g',

  isSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },

  async _registerSW() {
    return navigator.serviceWorker.register('sw.js');
  },

  _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  },

  // 'unsupported' | 'denied' | 'subscribed' | 'not-subscribed'
  async getStatus() {
    if (!this.isSupported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub ? 'subscribed' : 'not-subscribed';
  },

  async enable(profileId) {
    if (!this.isSupported()) throw new Error('unsupported');
    const reg = await this._registerSW();
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('denied');

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this._urlBase64ToUint8Array(this.VAPID_PUBLIC_KEY),
      });
    }
    const json = sub.toJSON();
    await Sb.savePushSubscription(profileId, {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    });
    return sub;
  },

  async disable() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await Sb.removePushSubscription(endpoint);
  },

  // Клик по строке «Уведомления» в профиле — включает/выключает подписку.
  async toggle() {
    if (!window._agentProfile) {
      App._toast('Войдите как агент, чтобы включить уведомления');
      Auth.showAgentLogin();
      return;
    }
    if (!this.isSupported()) {
      App._toast('Уведомления не поддерживаются этим браузером');
      return;
    }
    const status = await this.getStatus();
    try {
      if (status === 'subscribed') {
        await this.disable();
        App._toast('Уведомления отключены');
      } else if (status === 'denied') {
        App._toast('Уведомления заблокированы в настройках браузера');
      } else {
        await this.enable(window._agentProfile.id);
        App._toast('Уведомления включены ✓');
      }
    } catch (e) {
      App._toast('Не удалось изменить настройку уведомлений');
    }
    await this.refreshStatusUI();
  },

  async refreshStatusUI() {
    const el = document.getElementById('notifStatus');
    if (!el) return;
    const status = await this.getStatus();
    if (status === 'subscribed') { el.textContent = 'Включены'; el.classList.add('on'); }
    else if (status === 'denied') { el.textContent = 'Заблокированы'; el.classList.remove('on'); }
    else { el.textContent = 'Выключены'; el.classList.remove('on'); }
  },
};
