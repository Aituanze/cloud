(function () {
'use strict';

// ── Данные ──
var DISTRICTS = [
  { name:'Медеуский',     cls:'cg', pos:{top:'5%',    left:'38%'} },
  { name:'Алмалинский',   cls:'cb', pos:{top:'20%',   left:'3%'}  },
  { name:'Бостандыкский', cls:'cp', pos:{top:'20%',   right:'2%'} },
  { name:'Жетысуский',    cls:'co', pos:{bottom:'22%',left:'2%'}  },
  { name:'Наурызбайский', cls:'ck', pos:{bottom:'22%',right:'2%'} },
  { name:'Турксибский',   cls:'ca', pos:{bottom:'6%', left:'36%'} },
  { name:'Ауэзовский',    cls:'ct', pos:null },
  { name:'Алатауский',    cls:'cr', pos:null },
];

var CATS = [
  { key:'квартиры',     label:'Квартиры',     icon:'img/icon-kvartiry.png' },
  { key:'дома',         label:'Дома',         icon:'img/icon-doma.png'     },
  { key:'участки',      label:'Участки',      icon:'img/icon-uchastki.png' },
  { key:'коммерческая', label:'Коммерческая', icon:'img/icon-komm.png'     },
  { key:'дачи',         label:'Дачи',         icon:'img/icon-dachi.png'    },
];

var CATS_WITH_ROOMS = ['квартиры','дома'];

var ROOMS = [
  { key:0,    label:'Студия',      badge:'С',   bg:'#f3f0ff', color:'#7c3aed' },
  { key:1,    label:'1-комнатные', badge:'1к',  bg:'#eff6ff', color:'#1d4ed8' },
  { key:2,    label:'2-комнатные', badge:'2к',  bg:'#f0fdf4', color:'#15803d' },
  { key:3,    label:'3-комнатные', badge:'3к',  bg:'#fff7ed', color:'#c2410c' },
  { key:'4+', label:'4 и более',   badge:'4к+', bg:'#fdf4ff', color:'#9333ea' },
];

// ── Состояние ──
var state = { deal:'продажа', district:null, category:null, rooms:null };

// ── Объявления ──
var ALL = (function () {
  var seen = {}, out = [];
  (window.LISTINGS || []).forEach(function (l) {
    if (l && l.url && !seen[l.url]) { seen[l.url] = 1; out.push(l); }
  });
  return out;
}());

function filtered() {
  return ALL.filter(function (l) { return l.deal_type === state.deal; });
}
function countDistrict(name) {
  return filtered().filter(function (l) { return l.district === name; }).length;
}
function countCat(dn, ck) {
  return filtered().filter(function (l) { return l.district === dn && l.category === ck; }).length;
}
function countRoom(dn, ck, rk) {
  return filtered().filter(function (l) {
    if (l.district !== dn || l.category !== ck) return false;
    if (rk === '4+') return l.rooms >= 4;
    return l.rooms === rk;
  }).length;
}
function getListings(dn, ck, rk) {
  return filtered().filter(function (l) {
    if (l.district !== dn || l.category !== ck) return false;
    if (rk === null || rk === undefined) return true;
    if (rk === '4+') return l.rooms >= 4;
    return l.rooms === rk;
  });
}
function isNew(l) {
  return l.first_seen && (Date.now() - Date.parse(l.first_seen) <= 86400000);
}

// ── Навигация ──
var history = [];

function show(id) {
  document.querySelectorAll('.screen').forEach(function (s) {
    s.style.display = 'none';
  });
  var el = document.getElementById(id);
  if (el) {
    el.style.display = 'flex';
    el.scrollTop = 0;
  }
}

function goTo(id) {
  history.push(id);
  show(id);
}

function goBack() {
  if (history.length > 1) history.pop();
  show(history[history.length - 1] || 'screen-hero');
}

// ── ЭКРАН: Hero ──
function renderHero() {
  var total = filtered().length;
  var bw = document.getElementById('bubbles');
  bw.innerHTML = '';

  DISTRICTS.forEach(function (d) {
    if (!d.pos) return;
    var cnt = countDistrict(d.name);
    if (!cnt) return;
    var el = document.createElement('div');
    el.className = 'bubble';
    Object.keys(d.pos).forEach(function (k) { el.style[k] = d.pos[k]; });
    el.innerHTML = '<div class="bn">' + cnt + '</div><div class="bd">' + d.name + '</div>';
    el.addEventListener('click', function () {
      state.district = d.name;
      renderCats();
      goTo('screen-cats');
    });
    bw.appendChild(el);
  });

  // Переключатель
  document.querySelectorAll('.dt-btn').forEach(function (btn) {
    btn.classList.remove('active-sale', 'active-rent');
    if (btn.dataset.deal === state.deal) {
      btn.classList.add(state.deal === 'продажа' ? 'active-sale' : 'active-rent');
    }
  });
}

// ── ЭКРАН: Категории ──
function renderCats() {
  var badge = document.getElementById('cats-deal-badge');
  badge.textContent = state.deal === 'продажа' ? 'Продажа' : 'Аренда';
  badge.className = 'nb-badge' + (state.deal === 'аренда' ? ' rent' : '');

  var body = document.getElementById('cats-body');
  body.innerHTML = '';

  var ordered = DISTRICTS.slice().sort(function (a, b) {
    return (a.name === state.district ? -1 : b.name === state.district ? 1 : 0);
  });

  ordered.forEach(function (d) {
    var total = countDistrict(d.name);
    if (!total) return;

    var card = document.createElement('div');
    card.className = 'd-card ' + d.cls;

    var row = '<div class="cat-row">';
    CATS.forEach(function (c) {
      var cnt = countCat(d.name, c.key);
      row +=
        '<div class="cat-col' + (!cnt ? ' disabled' : '') + '" data-d="' + d.name + '" data-c="' + c.key + '">' +
          '<div class="cat-num">' + cnt + '</div>' +
          '<img class="cat-icon" src="' + c.icon + '">' +
          '<div class="cat-lbl">' + c.label + '</div>' +
        '</div>';
    });
    row += '</div>';

    card.innerHTML = row +
      '<div class="d-name"><span class="d-arr">→</span>' + d.name + '<span class="d-arr">←</span></div>' +
      '<div class="d-line"></div>';

    card.querySelectorAll('.cat-col:not(.disabled)').forEach(function (col) {
      col.addEventListener('click', function () {
        state.district = col.dataset.d;
        state.category = col.dataset.c;
        if (CATS_WITH_ROOMS.indexOf(state.category) >= 0) {
          renderRooms();
          goTo('screen-rooms');
        } else {
          state.rooms = null;
          renderListings();
          goTo('screen-list');
        }
      });
    });

    body.appendChild(card);
  });

  if (window.LISTINGS_BUILT_AT) {
    var info = document.createElement('div');
    info.className = 'd-built';
    info.textContent = 'Обновлено: ' + window.LISTINGS_BUILT_AT;
    body.appendChild(info);
  }
}

// ── ЭКРАН: Комнатность ──
function renderRooms() {
  var cat = CATS.filter(function (c) { return c.key === state.category; })[0];
  var catLabel = cat ? cat.label : state.category;
  var total = countCat(state.district, state.category);

  document.getElementById('rooms-title').textContent = catLabel + ' · ' + state.district;
  document.getElementById('rooms-badge').textContent = total;

  var grid = document.getElementById('rooms-grid');
  grid.innerHTML = '';

  ROOMS.forEach(function (r, i) {
    var cnt = countRoom(state.district, state.category, r.key);
    var card = document.createElement('div');
    card.className = 'rm-card' + (i === ROOMS.length - 1 ? ' wide' : '') + (!cnt ? ' disabled' : '');
    card.innerHTML =
      '<div class="rm-badge" style="background:' + r.bg + ';color:' + r.color + '">' + r.badge + '</div>' +
      '<div><div class="rm-cnt">' + cnt + '</div><div class="rm-nm">' + r.label + '</div></div>';
    if (cnt) {
      card.addEventListener('click', (function (rk) {
        return function () {
          state.rooms = rk;
          renderListings();
          goTo('screen-list');
        };
      }(r.key)));
    }
    grid.appendChild(card);
  });
}

// ── ЭКРАН: Объявления ──
function renderListings() {
  var cat = CATS.filter(function (c) { return c.key === state.category; })[0];
  var catLabel = cat ? cat.label : state.category;
  var roomLabel = '';
  if (state.rooms !== null && state.rooms !== undefined) {
    var rm = ROOMS.filter(function (x) { return x.key === state.rooms; })[0];
    roomLabel = rm ? ' · ' + rm.badge : '';
  }

  document.getElementById('list-title').textContent = catLabel + roomLabel + ' · ' + state.district;

  var items = getListings(state.district, state.category, state.rooms);
  items.sort(function (a, b) { return (b.price_value || 0) - (a.price_value || 0); });
  document.getElementById('list-badge').textContent = items.length + ' шт';

  var body = document.getElementById('list-body');
  body.innerHTML = '';

  if (!items.length) {
    body.innerHTML = '<div class="empty-msg">Объявлений не найдено</div>';
    return;
  }

  var fb = '<div class="filter-bar"><div class="fchip on">Все</div><div class="fchip">Новостройка</div><div class="fchip">Вторичка</div></div>';
  var cards = '<div class="listings-inner">';
  items.forEach(function (l) {
    var nt = isNew(l) ? '<div class="tag tag-new">Новинка</div>' : '';
    var tt = l.building_type ? '<div class="tag tag-type">' + l.building_type + '</div>' : '';
    var a = l.area ? l.area + ' м²' : '';
    var f = (l.floor && l.total_floors) ? l.floor + '/' + l.total_floors + ' эт' : '';
    var p = (l.price_value && l.area) ? Math.round(l.price_value / l.area / 1000) + 'к ₸/м²' : '';
    var chips = [a, f, p].filter(Boolean).map(function (t) { return '<span class="lc">' + t + '</span>'; }).join('');
    cards +=
      '<div class="lst-card">' +
        '<div class="lst-photo">🏢' + nt + tt + '</div>' +
        '<div class="lst-body">' +
          '<div class="lst-price">' + (l.price_text || '—') + '</div>' +
          '<div class="lst-info">' + (l.title || l.address || '') + '</div>' +
          '<div class="lst-chips">' + chips + '</div>' +
          '<a class="lst-cta" href="' + (l.url || '#') + '" target="_blank">Смотреть на Krisha.kz →</a>' +
        '</div>' +
      '</div>';
  });
  cards += '</div>';
  body.innerHTML = fb + cards;
}

// ── Обработчики ──
document.getElementById('deal-toggle').addEventListener('click', function (e) {
  var btn = e.target.closest('.dt-btn');
  if (!btn || btn.dataset.deal === state.deal) return;
  state.deal = btn.dataset.deal;
  renderHero();
  renderCats();
  // Если уже на экране категорий — перерисовываем; иначе hero
  var cur = history[history.length - 1];
  if (cur === 'screen-cats') renderCats();
});

document.getElementById('btn-back-cats').addEventListener('click', goBack);
document.getElementById('btn-back-rooms').addEventListener('click', goBack);
document.getElementById('btn-back-list').addEventListener('click', goBack);

// ── Старт ──
history.push('screen-hero');
renderHero();
renderCats();
document.querySelectorAll('.screen').forEach(function (s) { s.style.display = 'none'; });
document.getElementById('screen-hero').style.display = 'flex';

}());
