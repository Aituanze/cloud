const { test } = require("node:test");
const assert = require("node:assert");
const M = require("../js/mortgage.js");

test("monthlyPayment аннуитет (известный пример)", () => {
  // 12 000 000 под 7% на 25 лет ≈ 84 814 ₸/мес
  const p = M.monthlyPayment(12000000, 7, 25);
  assert.ok(Math.abs(p - 84814) < 50, "получено " + p);
});

test("monthlyPayment при нулевой ставке = равные доли", () => {
  assert.strictEqual(M.monthlyPayment(1200000, 0, 1), 100000);
});

test("calcMortgage по программе 7-20-25", () => {
  const r = M.calcMortgage(40000000, "7-20-25");
  assert.strictEqual(r.rate, 7);
  assert.strictEqual(r.years, 25);
  assert.strictEqual(r.down, 8000000);       // 20%
  assert.strictEqual(r.principal, 32000000);  // 80%
  assert.ok(r.monthly > 0);
});
