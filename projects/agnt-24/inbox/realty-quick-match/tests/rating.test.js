const { test } = require("node:test");
const assert = require("node:assert");
const G = require("../js/rating.js");

test("aggregateRating среднее и количество", () => {
  assert.deepStrictEqual(G.aggregateRating([{stars:5},{stars:4},{stars:4}]), {avg:4.3, count:3});
  assert.deepStrictEqual(G.aggregateRating([]), {avg:0, count:0});
});

test("computePoints суммирует по правилам", () => {
  const p = G.computePoints([{type:"listing_quality"},{type:"fast_reply"},{type:"showing_done"}]);
  assert.strictEqual(p, 50 + 30 + 100);
});

test("badgesForPoints для агента и покупателя", () => {
  assert.ok(G.badgesForPoints(1200, "agent").includes("Топ района"));
  assert.ok(G.badgesForPoints(120, "agent").includes("Новичок"));
  assert.ok(G.badgesForPoints(350, "buyer").includes("Надёжный покупатель"));
});

test("leaderboard сортирует по баллам, потом по рейтингу", () => {
  const lb = G.leaderboard([
    {id:"a", points:500, rating:{avg:4.1}},
    {id:"b", points:900, rating:{avg:4.9}},
    {id:"c", points:900, rating:{avg:5.0}}
  ]);
  assert.deepStrictEqual(lb.map(x=>x.id), ["c","b","a"]);
});
