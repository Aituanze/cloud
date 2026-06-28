(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RQM = root.RQM || {}; root.RQM.search = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var DAY = 24 * 3600 * 1000;

  function dedupeByUrl(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (it) {
      if (it && it.url && !seen[it.url]) { seen[it.url] = 1; out.push(it); }
    });
    return out;
  }
  function firstSeenMs(it, fsMap) {
    fsMap = fsMap || {};
    var t = Date.parse((it && it.first_seen) || fsMap[it && it.url] || "");
    return isNaN(t) ? 0 : t;
  }
  function isNew24(it, fsMap, nowMs) {
    nowMs = nowMs || Date.now();
    var t = firstSeenMs(it, fsMap);
    return t > 0 && (nowMs - t) <= DAY;
  }
  function filterListings(list, f) {
    f = f || {};
    return (list || []).filter(function (it) {
      if (f.district && it.district !== f.district) return false;
      if (f.category && it.category !== f.category) return false;
      if (f.rooms != null && it.rooms !== f.rooms) return false;
      if (f.priceMin != null && !(it.price_value >= f.priceMin)) return false;
      if (f.priceMax != null && !(it.price_value <= f.priceMax)) return false;
      if (f.floorMin != null && !(it.floor >= f.floorMin)) return false;
      if (f.only24 && !isNew24(it, f.fsMap, f.nowMs)) return false;
      return true;
    });
  }
  function countNew(list, fsMap, nowMs) {
    var res = {};
    (list || []).forEach(function (it) {
      if (!isNew24(it, fsMap, nowMs)) return;
      (res[it.district] = res[it.district] || {});
      res[it.district][it.category] = (res[it.district][it.category] || 0) + 1;
    });
    return res;
  }
  return { dedupeByUrl: dedupeByUrl, firstSeenMs: firstSeenMs, isNew24: isNew24,
           filterListings: filterListings, countNew: countNew };
});
