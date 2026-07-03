(function (root) {
  var AGENTS = [
    { id: "a1", name: "Айгуль Сериковна", avatar: "👩🏻", district: "Бостандыкский",
      rating: { avg: 4.8, count: 32 }, points: 1450,
      badges: ["Топ района", "Быстрый ответ"],
      reviews: [{ by: "Покупатель", stars: 5, text: "Быстро показала, всё честно", ts: "2026-06-26T10:00:00Z" }] },
    { id: "a2", name: "Данияр Жанибеков", avatar: "👨🏻", district: "Алмалинский",
      rating: { avg: 4.3, count: 18 }, points: 760, badges: ["Быстрый ответ"],
      reviews: [{ by: "Покупатель", stars: 4, text: "Норм, перезвонил вечером", ts: "2026-06-25T18:00:00Z" }] },
    { id: "a3", name: "Мадина Е.", avatar: "👩🏽", district: "Медеуский",
      rating: { avg: 5.0, count: 9 }, points: 540, badges: [],
      reviews: [] }
  ];
  if (typeof module !== "undefined" && module.exports) module.exports = AGENTS;
  root.AGENTS = AGENTS;
})(typeof self !== "undefined" ? self : this);
