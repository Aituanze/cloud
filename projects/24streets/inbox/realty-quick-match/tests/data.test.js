const { test } = require("node:test");
const assert = require("node:assert");
const DISTRICTS = require("../data/districts.js");
const AGENTS = require("../data/agents.js");
const LISTINGS = require("../data/listings.js");

const NAMES = DISTRICTS.map(d => d.name);
const CATS = ["квартиры","дома","участки","коммерческая","дачи"];

test("7 районов, есть Алатауский, нет опечатки Алматауский", () => {
  assert.strictEqual(DISTRICTS.length, 7);
  assert.ok(NAMES.includes("Алатауский"));
  assert.ok(!NAMES.includes("Алматауский"));
});

test("у каждого района есть accent и корректный center [lng,lat]", () => {
  for (const d of DISTRICTS) {
    assert.match(d.accent, /^#[0-9a-f]{6}$/i);
    assert.ok(Array.isArray(d.center) && d.center.length === 2);
    assert.ok(d.center[0] > 76 && d.center[0] < 78, "lng Алматы");
    assert.ok(d.center[1] > 43 && d.center[1] < 44, "lat Алматы");
  }
});

test("объекты валидны: район из списка, категория из списка, есть координаты и agentId", () => {
  assert.ok(LISTINGS.length >= 12);
  const agentIds = new Set(AGENTS.map(a => a.id));
  for (const it of LISTINGS) {
    assert.ok(NAMES.includes(it.district), "район: " + it.district);
    assert.ok(CATS.includes(it.category), "категория: " + it.category);
    assert.ok(typeof it.lat === "number" && typeof it.lng === "number");
    assert.ok(agentIds.has(it.agentId), "agentId: " + it.agentId);
    assert.ok(typeof it.url === "string" && it.url.length > 0);
  }
});

test("покрыты все районы и все категории", () => {
  for (const n of NAMES) assert.ok(LISTINGS.some(it => it.district === n), "нет объектов: " + n);
  for (const c of CATS) assert.ok(LISTINGS.some(it => it.category === c), "нет категории: " + c);
});
