(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RQM = root.RQM || {}; root.RQM.mortgage = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var PROGRAMS = {
    standard:  { rate: 18, downPct: 20, years: 20 },
    "7-20-25": { rate: 7,  downPct: 20, years: 25 },
    otbasy:    { rate: 5,  downPct: 20, years: 25 }
  };
  function monthlyPayment(principal, annualRatePct, years) {
    var n = years * 12;
    if (annualRatePct === 0) return Math.round(principal / n);
    var i = annualRatePct / 100 / 12;
    var p = principal * i / (1 - Math.pow(1 + i, -n));
    return Math.round(p);
  }
  function calcMortgage(price, programKey) {
    var pr = PROGRAMS[programKey] || PROGRAMS.standard;
    var down = Math.round(price * pr.downPct / 100);
    var principal = price - down;
    return { principal: principal, down: down, rate: pr.rate, years: pr.years,
             monthly: monthlyPayment(principal, pr.rate, pr.years) };
  }
  return { PROGRAMS: PROGRAMS, monthlyPayment: monthlyPayment, calcMortgage: calcMortgage };
});
