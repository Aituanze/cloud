(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RQM = root.RQM || {}; root.RQM.share = Object.assign(api, root.RQM.share || {});
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function buildShareCaption(listing, agencyName) {
    return (listing.price_text || "") + " · " + (listing.district || "") + " р-н\n" +
      (listing.title || "") + "\n" +
      "Смотрите и записывайтесь на просмотр 👉 " + (agencyName || "наше агентство");
  }
  return { buildShareCaption: buildShareCaption };
});

(function () {
  if (typeof window === "undefined") return;
  var R = window.RQM;
  var AGENCY = "MyAgency"; // имя агентства для вотермарки (заменяется при внедрении)

  R.share.open = function (listing) {
    var c = document.createElement("canvas"); c.width = 720; c.height = 1280;
    var x = c.getContext("2d");
    var draw = function (img) {
      if (img) x.drawImage(img, 0, 0, 720, 1280); else { x.fillStyle = "#2f3b59"; x.fillRect(0,0,720,1280); }
      var g = x.createLinearGradient(0, 700, 0, 1280);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.8)");
      x.fillStyle = g; x.fillRect(0, 700, 720, 580);
      x.fillStyle = "#fff"; x.font = "bold 54px Arial";
      x.fillText(listing.price_text || "", 40, 1080);
      x.font = "30px Arial";
      x.fillText((listing.district || "") + " р-н", 40, 1130);
      x.fillText(listing.title || "", 40, 1175);
      x.font = "bold 28px Arial"; x.fillStyle = "#ffd166";
      x.fillText("▲ " + AGENCY, 40, 70);
      showModal(c);
    };
    var src = (listing.photos || [])[0];
    if (src) { var im = new Image(); im.crossOrigin = "anonymous"; im.onload = function(){draw(im)}; im.onerror = function(){draw(null)}; im.src = src; }
    else draw(null);
  };

  function showModal(canvas) {
    var ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px";
    canvas.style.cssText = "max-height:70vh;max-width:90vw;border-radius:12px";
    var btn = document.createElement("button"); btn.textContent = "Поделиться / Скачать";
    btn.className = "badge"; btn.style.fontSize = "16px"; btn.style.padding = "10px 18px";
    var close = document.createElement("button"); close.textContent = "Закрыть"; close.className = "badge";
    btn.onclick = function () {
      canvas.toBlob(function (blob) {
        var file = new File([blob], "object.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], text: "Новый объект!" });
        } else {
          var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
          a.download = "object.png"; a.click();
        }
      });
    };
    close.onclick = function () { document.body.removeChild(ov); };
    ov.appendChild(canvas); ov.appendChild(btn); ov.appendChild(close);
    document.body.appendChild(ov);
  }
})();
