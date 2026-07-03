(function () {
  "use strict";
  var R = window.RQM;
  var map = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmtPrice(v) {
    if (v >= 1e6) return Math.round(v / 1e5) / 10 + " млн";
    return v;
  }

  function render(host) {
    var el = document.createElement("div"); el.id = "map"; host.appendChild(el);
    if (typeof maplibregl === "undefined") {
      el.innerHTML = '<div class="empty">Карта недоступна офлайн. Запустите через локальный сервер.</div>';
      return;
    }
    map = new maplibregl.Map({
      container: el,
      style: "https://demotiles.maplibre.org/style.json",
      center: [76.92, 43.26], zoom: 11, pitch: 55, bearing: -15
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }));
    map.on("load", function () {
      var data = R.search.dedupeByUrl(window.LISTINGS || []);
      data.forEach(function (it) {
        if (typeof it.lng !== "number" || typeof it.lat !== "number") return;
        var pin = document.createElement("div");
        pin.className = "price-pin"; pin.textContent = fmtPrice(it.price_value);
        var popup = new maplibregl.Popup({ offset: 16, closeButton: false })
          .setHTML('<b>' + esc(it.price_text) + '</b><br>' + esc(it.title) +
                   '<br><small>' + esc(it.district) + ' р-н</small>');
        var m = new maplibregl.Marker({ element: pin })
          .setLngLat([it.lng, it.lat]).setPopup(popup).addTo(map);
        pin.addEventListener("mouseenter", function () { popup.addTo(map); });
        pin.addEventListener("click", function () { R.app.openFeed(it.district, it.category); });
      });
    });
  }

  R.app.register("map", render);
})();
