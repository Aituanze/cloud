(function (root) {
  var DISTRICTS = [
    { id: "bostandyk", name: "Бостандыкский", accent: "#7b3ff2", center: [76.906, 43.234] },
    { id: "almaly",    name: "Алмалинский",   accent: "#2f6bff", center: [76.930, 43.255] },
    { id: "medeu",     name: "Медеуский",     accent: "#19b36b", center: [76.965, 43.245] },
    { id: "auezov",    name: "Ауэзовский",    accent: "#13b4b1", center: [76.860, 43.230] },
    { id: "zhetysu",   name: "Жетысуйский",   accent: "#d39a1f", center: [76.905, 43.290] },
    { id: "alatau",    name: "Алатауский",    accent: "#ff6a13", center: [76.880, 43.310] },
    { id: "talgar",    name: "Талгарский",    accent: "#e23a76", center: [77.230, 43.300] }
  ];
  if (typeof module !== "undefined" && module.exports) module.exports = DISTRICTS;
  root.DISTRICTS = DISTRICTS;
})(typeof self !== "undefined" ? self : this);
