const { test } = require("node:test");
const assert = require("node:assert");
const L = require("../js/lead.js");

const listing = { id: 7, url: "https://krisha.kz/a/show/demo7", district: "Алмалинский", price_text: "20 000 000₸" };

test("buildLead собирает поля заявки", () => {
  const lead = L.buildLead(listing, "+7 701 000 00 00");
  assert.strictEqual(lead.listingId, 7);
  assert.strictEqual(lead.url, listing.url);
  assert.strictEqual(lead.district, "Алмалинский");
  assert.strictEqual(lead.contact, "+7 701 000 00 00");
  assert.ok(lead.ts);
});

test("leadText содержит цену, район и ссылку", () => {
  const t = L.leadText(L.buildLead(listing, "+7 701"));
  assert.match(t, /20 000 000₸/);
  assert.match(t, /Алмалинский/);
  assert.match(t, /demo7/);
});

test("telegramUrl кодирует текст и username", () => {
  const u = L.telegramUrl("realty_agency", L.buildLead(listing, "+7 701"));
  assert.ok(u.startsWith("https://t.me/realty_agency?text="));
  assert.ok(!/\s/.test(u), "пробелы должны быть закодированы");
});
