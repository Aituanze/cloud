(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RQM = root.RQM || {}; root.RQM.rating = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var POINT_RULES = { listing_quality:50, fast_reply:30, showing_done:100,
                      good_review:20, buyer_review:15, buyer_showing:40 };

  function aggregateRating(reviews) {
    reviews = reviews || [];
    if (!reviews.length) return { avg: 0, count: 0 };
    var s = 0; reviews.forEach(function (r) { s += (r.stars || 0); });
    return { avg: Math.round((s / reviews.length) * 10) / 10, count: reviews.length };
  }
  function computePoints(events) {
    return (events || []).reduce(function (acc, e) { return acc + (POINT_RULES[e.type] || 0); }, 0);
  }
  function badgesForPoints(points, role) {
    var b = [];
    if (role === "buyer") {
      if (points >= 300) b.push("Надёжный покупатель");
      else if (points >= 50) b.push("Активный");
    } else {
      if (points >= 1000) b.push("Топ района");
      else if (points >= 500) b.push("Профи");
      else if (points >= 100) b.push("Новичок");
    }
    return b;
  }
  function leaderboard(agents) {
    return (agents || []).slice().sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      return (b.rating && b.rating.avg || 0) - (a.rating && a.rating.avg || 0);
    });
  }
  return { POINT_RULES: POINT_RULES, aggregateRating: aggregateRating,
           computePoints: computePoints, badgesForPoints: badgesForPoints, leaderboard: leaderboard };
});
