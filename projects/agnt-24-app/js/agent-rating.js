/* ─────────────────────────────────────────
   Рейтинг агента — по образцу Яндекс Такси:
   звёзды растут от дисциплины, уровень (и привилегии) — от объёма работы.
───────────────────────────────────────── */
const AgentRating = {
  _statsKey: '24s_agent_stats',

  getStats() {
    try { return JSON.parse(localStorage.getItem(this._statsKey) || '{}'); }
    catch { return {}; }
  },
  _saveStats(s) { localStorage.setItem(this._statsKey, JSON.stringify(s)); },

  recordClaim() {
    const s = this.getStats();
    s.claimedTotal = (s.claimedTotal || 0) + 1;
    this._saveStats(s);
  },
  recordAbandon() {
    const s = this.getStats();
    s.abandoned = (s.abandoned || 0) + 1;
    this._saveStats(s);
  },
  recordCompletedListing(id) {
    const s = this.getStats();
    s.completedIds = s.completedIds || [];
    if (!s.completedIds.includes(id)) s.completedIds.push(id);
    this._saveStats(s);
  },

  // Уровни как в Яндекс Про: выше объём + рейтинг → больше привилегий и бонус за сделку
  TIERS: [
    { id: 'bronze',   label: 'Бронза',  minDeals: 0,  minRating: 0,
      perks: ['Базовый доступ к объектам', 'Стандартная очередь на новые лиды'] },
    { id: 'silver',   label: 'Серебро', minDeals: 10, minRating: 4.5,
      perks: ['Приоритет в получении новых лидов', '+5% к бонусу за сделку'] },
    { id: 'gold',     label: 'Золото',  minDeals: 30, minRating: 4.7,
      perks: ['Ранний доступ к новым объектам (до общей ленты)', '+10% к бонусу за сделку', 'Значок «Золото» в профиле и ленте'] },
    { id: 'platinum', label: 'Платина', minDeals: 75, minRating: 4.9,
      perks: ['Персональный приоритет у МОП', '+15% к бонусу за сделку', 'Топ-агент месяца', 'Кастомная визитка в ленте покупателя'] },
  ],

  compute() {
    const s = this.getStats();
    const claimed   = s.claimedTotal || 0;
    const abandoned = s.abandoned || 0;
    const completed = (s.completedIds || []).length;

    // Дисциплина: старт со 100, штраф за снятые с работы объекты,
    // бонус за полностью заполненные карточки (фото+описание+цена).
    let discipline = 100 - abandoned * 8 + Math.min(completed, 10) * 2;
    discipline = Math.max(0, Math.min(100, discipline));

    const stars = Math.round((3.5 + (discipline / 100) * 1.5) * 10) / 10;
    const dealsCount = claimed;

    let tier = this.TIERS[0];
    for (const t of this.TIERS) {
      if (dealsCount >= t.minDeals && stars >= t.minRating) tier = t;
    }
    const nextTier = this.TIERS[this.TIERS.indexOf(tier) + 1] || null;

    let progress = 1, dealsToNext = 0, ratingToNext = 0;
    if (nextTier) {
      dealsToNext  = Math.max(0, nextTier.minDeals  - dealsCount);
      ratingToNext = Math.round(Math.max(0, nextTier.minRating - stars) * 10) / 10;
      const denom = Math.max(nextTier.minDeals - tier.minDeals, 1);
      progress = Math.max(0, Math.min(1, (dealsCount - tier.minDeals) / denom));
    }

    return { stars, discipline, dealsCount, abandoned, completed, tier, nextTier, progress, dealsToNext, ratingToNext };
  },
};
