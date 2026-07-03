(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RQM = root.RQM || {}; root.RQM.lead = Object.assign(api, root.RQM.lead || {});
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function buildLead(listing, contact) {
    return {
      listingId: listing.id, url: listing.url, district: listing.district,
      price_text: listing.price_text, contact: contact, ts: new Date().toISOString()
    };
  }
  function leadText(lead) {
    return "Заявка на просмотр\n" +
      "Объект: " + (lead.price_text || "") + " · " + (lead.district || "") + " р-н\n" +
      "Ссылка: " + lead.url + "\n" +
      "Контакт: " + lead.contact;
  }
  function telegramUrl(username, lead) {
    return "https://t.me/" + username + "?text=" + encodeURIComponent(leadText(lead));
  }
  return { buildLead: buildLead, leadText: leadText, telegramUrl: telegramUrl };
});

(function () {
  if (typeof window === "undefined") return;
  var R = window.RQM;
  var AGENCY_TELEGRAM = "realty_agency"; // username канала/бота агентства (заменяется при внедрении)
  R.lead.open = function (listing) {
    var contact = window.prompt("Ваш телефон для связи с агентом:");
    if (!contact) return;
    var lead = R.lead.buildLead(listing, contact);
    var leads = (function(){try{return JSON.parse(localStorage.getItem("rqm_leads")||"[]")}catch(e){return[]}})();
    leads.push(lead); localStorage.setItem("rqm_leads", JSON.stringify(leads));
    window.open(R.lead.telegramUrl(AGENCY_TELEGRAM, lead), "_blank");
  };
})();
