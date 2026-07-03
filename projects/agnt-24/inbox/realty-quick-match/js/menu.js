(function () {
  "use strict";
  var R = window.RQM; R.state = R.state || {};
  var CATS = [
    { key: "квартиры",    icon: "apartment",  label: "Квартиры" },
    { key: "дома",        icon: "house",      label: "Дома" },
    { key: "участки",     icon: "land",       label: "Участки" },
    { key: "коммерческая",icon: "commercial", label: "Коммерческая" },
    { key: "дачи",        icon: "dacha",      label: "Дачи" }
  ];

  function render(host) {
    var data = R.search.dedupeByUrl(window.LISTINGS || []);
    var counts = R.search.countNew(data, loadFS(), Date.now());

    var head = document.createElement("div");
    head.className = "shead";
    head.innerHTML = '<h1 class="shead__t">Новинки за 24 часа</h1>' +
      '<p class="shead__s">Свежие объекты по районам Алматы — выберите категорию</p>';
    host.appendChild(head);

    var frag = document.createDocumentFragment();
    (window.DISTRICTS || []).forEach(function (d) {
      var dc = counts[d.name] || {};
      var total = CATS.reduce(function (s, c) { return s + (dc[c.key] || 0); }, 0);

      var card = document.createElement("div");
      card.className = "dcard"; card.style.setProperty("--acc", d.accent);

      var top = document.createElement("div"); top.className = "dcard__top";
      top.innerHTML = '<span class="dcard__name"><span class="dcard__dot"></span>' + d.name + '</span>' +
        (total ? '<span class="dcard__new">+' + total + ' за 24ч</span>'
               : '<span class="dcard__all">5 категорий</span>');

      var row = document.createElement("div"); row.className = "dcard__row";
      CATS.forEach(function (c) {
        var n = dc[c.key] || 0;
        var btn = document.createElement("button");
        btn.className = "cat"; btn.type = "button";
        btn.innerHTML =
          '<span class="cat__tile">' + R.icon(c.icon) +
            (n ? '<span class="cat__badge">' + n + '</span>' : '') + '</span>' +
          '<span class="cat__name">' + c.label + '</span>';
        btn.addEventListener("click", function () {
          R.state.feed = { district: d.name, category: c.key };
          if (R.app.openFeed) R.app.openFeed(d.name, c.key); else R.app.go("map");
        });
        row.appendChild(btn);
      });

      card.appendChild(top); card.appendChild(row);
      frag.appendChild(card);
    });
    host.appendChild(frag);
  }

  function loadFS() { try { return JSON.parse(localStorage.getItem("rqm_first_seen") || "{}"); } catch (e) { return {}; } }
  R.app.register("menu", render);
})();
