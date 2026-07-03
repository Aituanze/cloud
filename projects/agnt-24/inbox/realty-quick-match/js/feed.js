(function () {
  "use strict";
  var R = window.RQM; R.state = R.state || {};

  R.agentById = function (id) {
    return (window.AGENTS || []).filter(function (a) { return a.id === id; })[0] || null;
  };

  R.app.openFeed = function (district, category) {
    R.state.feed = { district: district, category: category };
    R.app.go("feed");
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function liked() { try { return JSON.parse(localStorage.getItem("rqm_liked") || "{}"); } catch (e) { return {}; } }
  function saved() { try { return JSON.parse(localStorage.getItem("rqm_saved") || "{}"); } catch (e) { return {}; } }
  function toggle(key, url) {
    var m = (function(){try{return JSON.parse(localStorage.getItem(key)||"{}")}catch(e){return{}}})();
    m[url] = !m[url]; localStorage.setItem(key, JSON.stringify(m)); return m[url];
  }

  function render(host) {
    var f = R.state.feed || {};
    var data = R.search.dedupeByUrl(window.LISTINGS || []);
    var list = R.search.filterListings(data, { district: f.district, category: f.category });
    var wrap = document.createElement("div"); wrap.className = "feed";

    var back = document.createElement("button");
    back.className = "feed__back"; back.innerHTML = R.icon("chevron", { size: 22 });
    back.addEventListener("click", function () { R.app.go("menu"); });
    host.appendChild(back);

    if (!list.length) { wrap.innerHTML = '<div class="empty" style="color:#fff">Нет объектов в этой категории</div>'; host.appendChild(wrap); return; }

    var likedMap = liked();
    var savedMap = saved();
    list.forEach(function (it) {
      var ag = R.agentById(it.agentId) || { name: "Агент", rating: { avg: 0 } };
      var media = it.video
        ? '<video src="' + esc(it.video) + '" muted loop playsinline autoplay></video>'
        : '';
      var bg = it.video ? '' : 'background-image:url(' + ((it.photos || [])[0] || "") + ')';
      var isNew = R.search.isNew24(it, {}, Date.now());
      var isLiked = !!likedMap[it.url], isSaved = !!savedMap[it.url];
      var slide = document.createElement("section");
      slide.className = "slide";
      slide.innerHTML =
        '<div class="slide__media" style="' + bg + '">' + media + '</div>' +
        '<div class="slide__grad"></div>' +
        (isNew ? '<div class="slide__new"><span class="dot"></span>Новое за 24 часа</div>' : '') +
        '<div class="slide__info">' +
          '<div class="slide__price">' + esc(it.price_text) + '</div>' +
          '<div class="slide__meta">' + esc(it.title) + '</div>' +
          '<div class="slide__meta">' + esc(it.district) + ' р-н · ' + esc(it.address) + '</div>' +
          '<div class="slide__agent">' +
            '<span class="avatar avatar--sm">' + R.initials(ag.name) + '</span>' +
            '<span class="nm">' + esc(ag.name) + '</span>' +
            '<span class="star">' + R.icon("star", { fill: true, size: 14 }) + (ag.rating.avg || "—") + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="actions">' +
          '<button class="actbtn' + (isLiked ? " is-like" : "") + '" data-act="like">' + R.icon("heart", { fill: isLiked, size: 22 }) + '</button>' +
          '<button class="actbtn' + (isSaved ? " is-save" : "") + '" data-act="save">' + R.icon("bookmark", { fill: isSaved, size: 22 }) + '</button>' +
          '<button class="actbtn" data-act="share">' + R.icon("share", { size: 22 }) + '</button>' +
          '<button class="actbtn" data-act="lead">' + R.icon("send", { size: 22 }) + '</button>' +
        '</div>';
      slide.querySelector('[data-act="like"]').addEventListener("click", function () {
        var on = toggle("rqm_liked", it.url);
        this.classList.toggle("is-like", on);
        this.innerHTML = R.icon("heart", { fill: on, size: 22 });
      });
      slide.querySelector('[data-act="save"]').addEventListener("click", function () {
        var on = toggle("rqm_saved", it.url);
        this.classList.toggle("is-save", on);
        this.innerHTML = R.icon("bookmark", { fill: on, size: 22 });
      });
      slide.querySelector('[data-act="share"]').addEventListener("click", function () {
        if (R.share && R.share.open) R.share.open(it); else alert("Поделиться (скоро)");
      });
      slide.querySelector('[data-act="lead"]').addEventListener("click", function () {
        if (R.lead && R.lead.open) R.lead.open(it); else alert("Заявка (скоро)");
      });
      wrap.appendChild(slide);
    });
    host.appendChild(wrap);
  }

  R.app.register("feed", render);
})();
