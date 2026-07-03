(function () {
  "use strict";
  // Набор минималистичных линейных SVG-иконок (premium-стиль, currentColor).
  var P = {
    apartment: '<rect x="5" y="3" width="14" height="18" rx="1.6"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/><path d="M10 21v-3h4v3"/>',
    house: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
    land: '<path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10Z"/><circle cx="12" cy="11" r="2.2"/>',
    commercial: '<path d="M4 9l1.3-4h13.4L20 9"/><path d="M5 9h14v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9Z"/><path d="M6 14v6h12v-6"/><path d="M10 20v-3h4v3"/>',
    dacha: '<path d="M4 12 12 6l8 6"/><path d="M6 11v9h12v-9"/><path d="M10 20v-4h4v4"/><circle cx="18.5" cy="5.5" r="1.5"/>',
    heart: '<path d="M12 21C12 21 4 15.5 4 9.6A4.6 4.6 0 0 1 12 6.2 4.6 4.6 0 0 1 20 9.6C20 15.5 12 21 12 21Z"/>',
    bookmark: '<path d="M6 4h12v16l-6-4-6 4V4Z"/>',
    share: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4.5"/>',
    send: '<path d="M22 3 11 14"/><path d="M22 3 15 21l-4-7-7-4 18-7Z"/>',
    feed: '<rect x="4" y="3" width="16" height="7.5" rx="2.2"/><rect x="4" y="13.5" width="16" height="7.5" rx="2.2"/>',
    map: '<path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20.5 20.5 17 17"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    star: '<path d="M12 3.6 14.5 9l5.9.5-4.5 3.9 1.4 5.8L12 16.1 6.7 19.2l1.4-5.8L3.6 9.5 9.5 9 12 3.6Z"/>',
    trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 5.5H4.5V7A2.5 2.5 0 0 0 7 9.5M17 5.5h2.5V7A2.5 2.5 0 0 1 17 9.5"/><path d="M12 13v3M9.5 20h5M10.5 16h3v4h-3z"/>',
    chevron: '<path d="M15 6 9 12l6 6"/>'
  };

  function icon(name, opts) {
    opts = opts || {};
    var inner = P[name] || "";
    var size = opts.size || 24;
    var fill = opts.fill ? "currentColor" : "none";
    var stroke = opts.fill ? "none" : "currentColor";
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="' + fill +
      '" stroke="' + stroke + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      inner + '</svg>';
  }

  function initials(name) {
    var parts = String(name == null ? "" : name).trim().split(/\s+/).slice(0, 2);
    var s = parts.map(function (p) { return (p[0] || "").toUpperCase(); }).join("");
    return s || "?";
  }

  window.RQM = window.RQM || {};
  window.RQM.icon = icon;
  window.RQM.initials = initials;
})();
