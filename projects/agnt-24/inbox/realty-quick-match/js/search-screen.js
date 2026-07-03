(function () {
  "use strict";
  var R = window.RQM;
  var NAMES = (window.DISTRICTS || []).map(function (d) { return d.name; });
  var CATS = ["квартиры","дома","участки","коммерческая","дачи"];

  function render(host) {
    var head = document.createElement("div");
    head.className = "shead";
    head.innerHTML = '<h1 class="shead__t">Поиск</h1>' +
      '<p class="shead__s">Подберите объекты по параметрам и откройте ленту</p>';
    host.appendChild(head);

    var box = document.createElement("div"); box.className = "panel";
    box.innerHTML =
      '<div class="panel__h">Параметры объекта</div>' +
      '<div class="field"><label>Район</label><select id="f-d"><option value="">Любой</option>' +
        NAMES.map(function (n){return '<option>'+n+'</option>'}).join("") + '</select></div>' +
      '<div class="field"><label>Категория</label><select id="f-c"><option value="">Любая</option>' +
        CATS.map(function (c){return '<option>'+c+'</option>'}).join("") + '</select></div>' +
      '<div class="field"><label>Цена, ₸</label><div class="row2">' +
        '<input id="f-pmin" type="number" inputmode="numeric" placeholder="Цена от">' +
        '<input id="f-pmax" type="number" inputmode="numeric" placeholder="Цена до"></div></div>' +
      '<button class="btn btn--primary" id="f-go">Показать в ленте</button>' +
      '<div class="result" id="f-res"></div>';
    host.appendChild(box);

    var calc = document.createElement("div"); calc.className = "panel";
    calc.innerHTML =
      '<div class="panel__h">Ипотечный калькулятор (КЗ)</div>' +
      '<div class="field"><label>Цена объекта, ₸</label><input id="m-p" type="number" value="40000000"></div>' +
      '<div class="field"><label>Программа</label><select id="m-prog">' +
        '<option value="7-20-25">7-20-25 (7%, 25 лет)</option>' +
        '<option value="otbasy">Отбасы (5%, 25 лет)</option>' +
        '<option value="standard">Стандарт (18%, 20 лет)</option>' +
      '</select></div>' +
      '<button class="btn btn--primary" id="m-go">Рассчитать</button>' +
      '<div class="calc__res" id="m-res"></div>';
    host.appendChild(calc);

    box.querySelector("#f-go").addEventListener("click", function () {
      var d = box.querySelector("#f-d").value, c = box.querySelector("#f-c").value;
      var pmin = parseInt(box.querySelector("#f-pmin").value, 10);
      var pmax = parseInt(box.querySelector("#f-pmax").value, 10);
      var data = R.search.dedupeByUrl(window.LISTINGS || []);
      var res = R.search.filterListings(data, {
        district: d || undefined,
        category: c || undefined,
        priceMin: isNaN(pmin) ? undefined : pmin,
        priceMax: isNaN(pmax) ? undefined : pmax
      });
      box.querySelector("#f-res").textContent = "Найдено: " + res.length;
      if (res.length) R.app.openFeed(d || res[0].district, c || res[0].category);
    });

    calc.querySelector("#m-go").addEventListener("click", function () {
      var price = parseInt(calc.querySelector("#m-p").value, 10) || 0;
      var prog = calc.querySelector("#m-prog").value;
      var r = R.mortgage.calcMortgage(price, prog);
      calc.querySelector("#m-res").innerHTML =
        "Первый взнос: " + r.down.toLocaleString("ru-RU") + " ₸<br>" +
        "Кредит: " + r.principal.toLocaleString("ru-RU") + " ₸<br>" +
        "Платёж: <b>" + r.monthly.toLocaleString("ru-RU") + " ₸/мес</b> · " + r.rate + "% · " + r.years + " лет";
    });
  }

  R.app.register("search", render);
})();
