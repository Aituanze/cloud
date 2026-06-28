(function () {
  "use strict";
  var R = window.RQM;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function localReviews(agentId) {
    var all = (function(){try{return JSON.parse(localStorage.getItem("rqm_reviews")||"{}")}catch(e){return{}}})();
    return all[agentId] || [];
  }
  function effectiveRating(a) {
    var combined = (a.reviews || []).concat(localReviews(a.id));
    var agg = R.rating.aggregateRating(combined);
    return agg.count ? agg : (a.rating || { avg: 0, count: 0 });
  }

  R.app.reviewAgent = function (agentId) {
    var reviewed = (function(){try{return JSON.parse(localStorage.getItem("rqm_reviewed")||"{}")}catch(e){return{}}})();
    if (reviewed[agentId]) { alert("Вы уже оценили этого агента"); return; }
    var stars = parseInt(window.prompt("Оцените агента (1–5):"), 10);
    if (!(stars >= 1 && stars <= 5)) return;
    var text = window.prompt("Короткий отзыв (необязательно):") || "";
    var all = (function(){try{return JSON.parse(localStorage.getItem("rqm_reviews")||"{}")}catch(e){return{}}})();
    (all[agentId] = all[agentId] || []).push({ by: "Покупатель", stars: stars, text: text, ts: new Date().toISOString() });
    localStorage.setItem("rqm_reviews", JSON.stringify(all));
    reviewed[agentId] = true;
    localStorage.setItem("rqm_reviewed", JSON.stringify(reviewed));
    R.app.go("profile");
  };

  function render(host) {
    var agents = (window.AGENTS || []).map(function (a) {
      var er = effectiveRating(a);
      return Object.assign({}, a, { rating: er });
    });
    var me = agents[0]; // демо: первый агент как «я»

    var ranked = R.rating.leaderboard(agents);
    var meRank = 0;
    for (var i = 0; i < ranked.length; i++) { if (ranked[i].id === me.id) { meRank = i + 1; break; } }

    var prof = document.createElement("div");
    prof.className = "prof";
    var badges = R.rating.badgesForPoints(me.points, "agent");
    prof.innerHTML =
      '<div class="prof__ava">' + R.initials(me.name) + '</div>' +
      '<div class="prof__name">' + esc(me.name) + '</div>' +
      '<div class="prof__role">Риэлтор · ' + esc(me.district) + ' район</div>' +
      '<div class="prof__stat">' +
        '<span class="stat"><b>' + R.icon("star", { fill: true, size: 15 }) + me.rating.avg + '</b><i>' + me.rating.count + ' отзывов</i></span>' +
        '<span class="stat"><b>' + R.icon("trophy", { size: 15 }) + me.points + '</b><i>баллов</i></span>' +
        '<span class="stat"><b>#' + meRank + '</b><i>в топе</i></span>' +
      '</div>' +
      '<div>' + badges.map(function (b) { return '<span class="badge">' + esc(b) + '</span>'; }).join("") + '</div>' +
      '<div style="margin-top:14px"><button class="btn btn--ghost" id="rv">Оценить агента</button></div>';
    host.appendChild(prof);

    var h2 = document.createElement("div"); h2.className = "h2"; h2.textContent = "Топ агентов района";
    host.appendChild(h2);

    var lb = document.createElement("div"); lb.className = "lb";
    R.rating.leaderboard(agents).forEach(function (a, i) {
      var row = document.createElement("div"); row.className = "lb__row";
      row.innerHTML = '<span class="lb__pos">' + (i + 1) + '</span>' +
        '<span class="avatar avatar--sm avatar--navy">' + R.initials(a.name) + '</span>' +
        '<span class="lb__name">' + esc(a.name) +
          '<i>' + R.icon("star", { fill: true, size: 12 }) + a.rating.avg + '</i></span>' +
        '<span class="lb__pts">' + a.points + '</span>';
      lb.appendChild(row);
    });
    host.appendChild(lb);

    prof.querySelector("#rv").addEventListener("click", function () { R.app.reviewAgent(me.id); });
  }

  R.app.register("profile", render);
})();
