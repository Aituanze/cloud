const { test } = require("node:test");
const assert = require("node:assert");
const S = require("../js/search.js");

const NOW = Date.parse("2026-06-28T00:00:00Z");
const h = (n) => new Date(NOW - n * 3600 * 1000).toISOString();
const base = (over) => Object.assign({
  url: "u" + Math.random(), district: "Алмалинский", category: "квартиры",
  rooms: 2, price_value: 20000000, floor: 3, first_seen: h(1)
}, over);

test("dedupeByUrl оставляет первое вхождение", () => {
  const out = S.dedupeByUrl([base({url:"x",rooms:1}), base({url:"x",rooms:9}), base({url:"y"})]);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].rooms, 1);
});

test("isNew24 по first_seen", () => {
  assert.ok(S.isNew24(base({first_seen:h(5)}), {}, NOW));
  assert.ok(!S.isNew24(base({first_seen:h(30)}), {}, NOW));
});

test("isNew24 fallback на fsMap, если нет first_seen", () => {
  const it = base({first_seen:null, url:"z"});
  assert.ok(S.isNew24(it, {z:h(2)}, NOW));
  assert.ok(!S.isNew24(it, {z:h(48)}, NOW));
});

test("filterListings по району/категории/цене/комнатам", () => {
  const list = [
    base({url:"a", district:"Алмалинский", category:"квартиры", price_value:18e6, rooms:2}),
    base({url:"b", district:"Медеуский",  category:"квартиры", price_value:90e6, rooms:4}),
    base({url:"c", district:"Алмалинский", category:"дома",     price_value:40e6, rooms:5})
  ];
  assert.deepStrictEqual(
    S.filterListings(list, {district:"Алмалинский"}).map(x=>x.url), ["a","c"]);
  assert.deepStrictEqual(
    S.filterListings(list, {category:"квартиры", priceMax:50e6}).map(x=>x.url), ["a"]);
  assert.deepStrictEqual(
    S.filterListings(list, {rooms:4}).map(x=>x.url), ["b"]);
});

test("filterListings only24 фильтрует старые", () => {
  const list = [base({url:"new",first_seen:h(2)}), base({url:"old",first_seen:h(50)})];
  assert.deepStrictEqual(
    S.filterListings(list, {only24:true, nowMs:NOW, fsMap:{}}).map(x=>x.url), ["new"]);
});

test("countNew считает новинки 24ч по район×категория", () => {
  const list = [
    base({url:"1", district:"Алмалинский", category:"квартиры", first_seen:h(2)}),
    base({url:"2", district:"Алмалинский", category:"квартиры", first_seen:h(3)}),
    base({url:"3", district:"Алмалинский", category:"дома",     first_seen:h(50)})
  ];
  const c = S.countNew(list, {}, NOW);
  assert.strictEqual(c["Алмалинский"]["квартиры"], 2);
  assert.strictEqual((c["Алмалинский"]["дома"]||0), 0);
});
