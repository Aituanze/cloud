(function () {
  "use strict";
  window.RQM = window.RQM || {};

  var screens = {}; // регистрируются модулями экранов: RQM.app.register("menu", fn)
  var current = null;

  function render(name) {
    var host = document.getElementById("screen");
    current = name;
    document.querySelectorAll(".tab").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-screen") === name);
    });
    host.innerHTML = "";
    if (screens[name]) screens[name](host);
    else host.innerHTML = '<div class="empty">Экран «' + name + '» в разработке</div>';
    window.scrollTo(0, 0);
  }

  function register(name, fn) { screens[name] = fn; if (current === name) render(name); }
  function go(name) {
    render(name);
    if (("#" + name) !== location.hash) {
      try { history.replaceState(null, "", "#" + name); } catch (e) { location.hash = name; }
    }
  }

  function initialScreen() {
    var h = (location.hash || "").replace(/^#/, "");
    return h || "menu";
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("tabbar").addEventListener("click", function (e) {
      var btn = e.target.closest(".tab"); if (!btn) return;
      go(btn.getAttribute("data-screen"));
    });
    go(initialScreen());
  });

  RQM.app = { register: register, go: go };
})();
