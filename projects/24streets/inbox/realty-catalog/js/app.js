(function () {
  "use strict";

  var DAY_MS = 24 * 60 * 60 * 1000;
  var FS_KEY = "realty_first_seen"; // { url: ISO } — когда объявление впервые попало в каталог

  // --- дедупликация по URL: оставляем только первое вхождение ---
  var DATA = (function () {
    var seenUrl = {}, out = [];
    (window.LISTINGS || []).forEach(function (it) {
      if (it && it.url && !seenUrl[it.url]) { seenUrl[it.url] = 1; out.push(it); }
    });
    return out;
  })();

  // --- индекс «первого появления» (для новинок за 24 часа) ---
  var firstSeen = loadFS();
  (function ensureFirstSeen() {
    var now = new Date().toISOString(), changed = false;
    DATA.forEach(function (it) {
      // приоритет — дата из данных парсера; иначе фиксируем момент первого показа
      if (it.first_seen && !firstSeen[it.url]) { firstSeen[it.url] = it.first_seen; changed = true; }
      else if (!firstSeen[it.url]) { firstSeen[it.url] = now; changed = true; }
    });
    if (changed) saveFS();
  })();

  function loadFS() { try { return JSON.parse(localStorage.getItem(FS_KEY) || "{}"); } catch (e) { return {}; } }
  function saveFS() { localStorage.setItem(FS_KEY, JSON.stringify(firstSeen)); }
  function firstSeenMs(it) { var t = Date.parse(it.first_seen || firstSeen[it.url] || ""); return isNaN(t) ? 0 : t; }
  function isNew24(it) { return Date.now() - firstSeenMs(it) <= DAY_MS; }

  var state = {
    only24: true,
    category: null,
    search: "",
    district: "",
    priceMin: null,
    priceMax: null,
    groupBy: "building_type",
    sortBy: "new",
    collapsed: {},
  };

  // ---------- утилиты ----------
  function roomsLabel(r) {
    if (r === 0) return "Студия";
    if (r === null || r === undefined || r === "") return "—";
    return r + "-комн.";
  }
  function groupLabel(field, value) {
    if (field === "rooms") return roomsLabel(value);
    if (value === null || value === undefined || value === "") return "Прочее";
    return String(value);
  }
  function fmtPrice(v) { return v ? new Intl.NumberFormat("ru-RU").format(v) + " ₸" : "—"; }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function count24ByCategory(key) {
    var n = 0;
    for (var i = 0; i < DATA.length; i++)
      if (DATA[i].category === key && isNew24(DATA[i])) n++;
    return n;
  }
  function totalByCategory(key) {
    var n = 0;
    for (var i = 0; i < DATA.length; i++) if (DATA[i].category === key) n++;
    return n;
  }

  // ---------- подменю категорий ----------
  function renderCats() {
    var nav = document.getElementById("cats");
    nav.innerHTML = "";

    (window.CATEGORIES || []).forEach(function (c) {
      var total = totalByCategory(c.key);
      var fresh = count24ByCategory(c.key);
      var btn = el("button", "cat" + (state.category === c.key ? " cat--active" : "") + (total ? "" : " cat--empty"));
      btn.innerHTML =
        '<span class="cat__badge' + (fresh ? " cat__badge--hot" : "") + '">' + fresh + "</span>" +
        '<span class="cat__icon">' + (window.CATEGORY_ICONS[c.key] || "") + "</span>" +
        '<span class="cat__label">' + esc(c.label) + "</span>" +
        '<span class="cat__sub">' + (total ? total + " всего" : "нет данных") + "</span>";
      btn.title = c.label + ": новинок за 24ч — " + fresh + ", всего — " + total;
      btn.addEventListener("click", function () {
        state.category = state.category === c.key ? null : c.key;
        renderCats();
        render();
      });
      nav.appendChild(btn);
    });
  }

  // ---------- фильтрация ----------
  function filtered() {
    var q = state.search.trim().toLowerCase();
    return DATA.filter(function (it) {
      if (state.category && it.category !== state.category) return false;
      if (state.only24 && !isNew24(it)) return false;
      if (state.district && it.district !== state.district) return false;
      if (state.priceMin && (it.price_value || 0) < state.priceMin) return false;
      if (state.priceMax && (it.price_value || 0) > state.priceMax) return false;
      if (q) {
        var hay = [it.title, it.address, it.district, it.category].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function sortItems(items) {
    var by = state.sortBy;
    return items.sort(function (a, b) {
      if (by === "price_asc") return (a.price_value || 0) - (b.price_value || 0);
      if (by === "price_desc") return (b.price_value || 0) - (a.price_value || 0);
      if (by === "area_desc") return (b.area || 0) - (a.area || 0);
      return firstSeenMs(b) - firstSeenMs(a); // new
    });
  }

  function groupItems(items) {
    var map = new Map();
    items.forEach(function (it) {
      var key = groupLabel(state.groupBy, it[state.groupBy]);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    });
    return Array.from(map.entries()).sort(function (a, b) { return b[1].length - a[1].length; });
  }

  // ---------- карточка ----------
  function cardNode(it) {
    var fresh = isNew24(it);
    var card = el("article", "card" + (fresh ? " card--new" : ""));
    if (fresh) card.appendChild(el("span", "ribbon", "новинка"));
    card.appendChild(el("div", "card__price", fmtPrice(it.price_value)));
    card.appendChild(el("div", "card__title", esc(it.title)));

    var meta = el("div", "card__meta");
    if (it.rooms !== null && it.rooms !== undefined && it.rooms !== "")
      meta.appendChild(el("span", "tag", esc(roomsLabel(it.rooms))));
    if (it.area) meta.appendChild(el("span", "tag", esc(it.area) + " м²"));
    if (it.floor) meta.appendChild(el("span", "tag", "эт. " + it.floor + (it.total_floors ? "/" + it.total_floors : "")));
    if (it.building_type) meta.appendChild(el("span", "tag tag--accent", esc(it.building_type)));
    card.appendChild(meta);

    card.appendChild(el("div", "card__addr", "📍 " + esc(it.address || it.district)));

    var foot = el("div", "card__foot");
    foot.appendChild(el("span", "tag tag--soft", esc(it.district || "")));
    var link = el("a", "card__link", "Открыть →");
    link.href = it.url; link.target = "_blank"; link.rel = "noopener";
    foot.appendChild(link);
    card.appendChild(foot);
    return card;
  }

  // ---------- рендер ----------
  function render() {
    // хлебные крошки
    var cat = state.category
      ? (window.CATEGORIES.filter(function (c) { return c.key === state.category; })[0] || {}).label
      : null;
    document.getElementById("crumbs").innerHTML = cat
      ? 'Категория: <b>' + esc(cat) + "</b> — разбивка " +
        (state.groupBy === "building_type" ? "по типам" : state.groupBy === "district" ? "по районам" : "по комнатности")
      : "<b>Все категории</b>";

    var items = sortItems(filtered());
    document.getElementById("empty").hidden = items.length !== 0;

    var container = document.getElementById("groups");
    container.innerHTML = "";
    groupItems(items).forEach(function (pair) {
      var title = pair[0], list = pair[1];
      var fresh = list.filter(isNew24).length;
      var collapsed = !!state.collapsed[title];
      var group = el("section", "group" + (collapsed ? " group--collapsed" : ""));

      var head = el("div", "group__head");
      head.appendChild(el("span", "group__title", esc(title)));
      head.appendChild(el("span", "group__count", list.length + " объект." +
        (fresh ? ' · <span class="hl">' + fresh + " новых</span>" : "")));
      head.appendChild(el("span", "group__chevron", "▾"));
      head.addEventListener("click", function () { state.collapsed[title] = !state.collapsed[title]; render(); });
      group.appendChild(head);

      var cards = el("div", "cards");
      list.forEach(function (it) { cards.appendChild(cardNode(it)); });
      group.appendChild(cards);
      container.appendChild(group);
    });
  }

  // ---------- инициализация контролов ----------
  function fillDistricts() {
    var sel = document.getElementById("districtSel");
    var set = {};
    DATA.forEach(function (it) { if (it.district) set[it.district] = (set[it.district] || 0) + 1; });
    Object.keys(set).sort(function (a, b) { return set[b] - set[a]; }).forEach(function (d) {
      var o = document.createElement("option");
      o.value = d; o.textContent = d + " (" + set[d] + ")";
      sel.appendChild(o);
    });
  }

  function bind() {
    document.getElementById("search").addEventListener("input", function (e) { state.search = e.target.value; render(); });
    document.getElementById("only24").addEventListener("change", function (e) { state.only24 = e.target.checked; render(); });
    document.getElementById("groupBy").addEventListener("change", function (e) { state.groupBy = e.target.value; render(); });
    document.getElementById("sortBy").addEventListener("change", function (e) { state.sortBy = e.target.value; render(); });
    document.getElementById("districtSel").addEventListener("change", function (e) { state.district = e.target.value; render(); });
    document.getElementById("priceMin").addEventListener("input", function (e) { state.priceMin = e.target.value ? Number(e.target.value) : null; render(); });
    document.getElementById("priceMax").addEventListener("input", function (e) { state.priceMax = e.target.value ? Number(e.target.value) : null; render(); });
    document.getElementById("reset").addEventListener("click", function () {
      state.category = null; state.search = ""; state.district = ""; state.priceMin = state.priceMax = null;
      document.getElementById("search").value = "";
      document.getElementById("districtSel").value = "";
      document.getElementById("priceMin").value = "";
      document.getElementById("priceMax").value = "";
      renderCats(); render();
    });
  }

  function init() {
    var meta = document.getElementById("meta");
    if (!DATA.length) {
      meta.textContent = "Данные не найдены. Запустите парсер и build_data.py.";
      document.getElementById("empty").hidden = false;
      return;
    }
    var fresh = DATA.filter(isNew24).length;
    meta.textContent = "Всего: " + DATA.length + " · новинок за 24ч: " + fresh +
      (window.LISTINGS_BUILT_AT ? " · обновлено " + window.LISTINGS_BUILT_AT : "");
    fillDistricts();
    renderCats();
    bind();
    render();
  }

  init();
})();
