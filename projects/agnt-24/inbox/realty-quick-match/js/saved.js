(function () {
  "use strict";
  var R = window.RQM;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function savedMap() {
    try { return JSON.parse(localStorage.getItem("rqm_saved") || "{}"); } catch (e) { return {}; }
  }

  function render(host) {
    var sm = savedMap();
    var all = R.search.dedupeByUrl(window.LISTINGS || []);
    var list = all.filter(function (it) { return sm[it.url] === true; });

    var head = document.createElement("div");
    head.className = "shead";
    head.innerHTML = '<h1 class="shead__t">Сохранённое</h1>' +
      '<p class="shead__s">Объекты, которые вы отметили закладкой</p>';
    host.appendChild(head);

    if (!list.length) {
      var empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Пока нет сохранённых объектов";
      host.appendChild(empty);
      return;
    }

    list.forEach(function (it) {
      var card = document.createElement("div");
      card.className = "scard";
      var photo = (it.photos || [])[0] || "";
      card.innerHTML =
        (photo ? '<img src="' + esc(photo) + '" alt="" />' : '') +
        '<div class="scard__price">' + esc(it.price_text) + '</div>' +
        '<div class="scard__title">' + esc(it.title) + '</div>' +
        '<div class="scard__sub">' + esc(it.district) + ' р-н</div>';
      card.addEventListener("click", function () {
        R.app.openFeed(it.district, it.category);
      });
      host.appendChild(card);
    });
  }

  R.app.register("saved", render);
})();
