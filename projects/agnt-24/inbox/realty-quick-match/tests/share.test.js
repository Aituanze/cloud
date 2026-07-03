const { test } = require("node:test");
const assert = require("node:assert");
const Sh = require("../js/share.js");

test("buildShareCaption включает цену, район и бренд агентства", () => {
  const cap = Sh.buildShareCaption(
    { price_text: "31 500 000₸", district: "Бостандыкский", title: "2-комн · 62 м²" },
    "MyAgency");
  assert.match(cap, /31 500 000₸/);
  assert.match(cap, /Бостандыкский/);
  assert.match(cap, /MyAgency/);
});
