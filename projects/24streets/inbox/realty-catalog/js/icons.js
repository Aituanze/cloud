// Иконки категорий (в стиле референса Inbox/icons.png): тёмно-синие силуэты,
// белые «вырезы» окон/дверей. Цвет силуэта берётся из currentColor (CSS).

window.CATEGORIES = [
  { key: "квартиры", label: "Квартиры" },
  { key: "дома", label: "Дома" },
  { key: "участки", label: "Участки" },
  { key: "коммерческая", label: "Коммерческая" },
  { key: "дачи", label: "Дачи" },
];

window.CATEGORY_ICONS = {
  "квартиры":
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="5" y="2.5" width="10" height="18.5" rx="1.2" fill="currentColor"/>' +
    '<rect x="6.8" y="5" width="2.3" height="2.3" fill="#fff"/>' +
    '<rect x="10.9" y="5" width="2.3" height="2.3" fill="#fff"/>' +
    '<rect x="6.8" y="9" width="2.3" height="2.3" fill="#fff"/>' +
    '<rect x="10.9" y="9" width="2.3" height="2.3" fill="#fff"/>' +
    '<rect x="8.5" y="14.5" width="3" height="6.5" rx="0.4" fill="#fff"/>' +
    '<circle cx="17.6" cy="16.2" r="3.4" fill="currentColor"/>' +
    '<circle cx="17.6" cy="15.3" r="1.1" fill="#fff"/>' +
    '<rect x="17.1" y="15.3" width="1" height="3.6" fill="#fff"/>' +
    "</svg>",

  "дома":
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 3 L21.5 10.5 H2.5 Z" fill="currentColor"/>' +
    '<rect x="5" y="10" width="14" height="11" rx="0.8" fill="currentColor"/>' +
    '<rect x="10.4" y="14" width="3.2" height="7" rx="0.3" fill="#fff"/>' +
    '<rect x="6.8" y="12.6" width="2.6" height="2.6" fill="#fff"/>' +
    '<rect x="14.6" y="12.6" width="2.6" height="2.6" fill="#fff"/>' +
    "</svg>",

  "участки":
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="2.5" y="15.5" width="19" height="5" rx="2" fill="currentColor" opacity="0.3"/>' +
    '<path d="M8.5 2.5 C5.6 2.5 3.5 4.7 3.5 7.4 C3.5 11 8.5 16 8.5 16 C8.5 16 13.5 11 13.5 7.4 C13.5 4.7 11.4 2.5 8.5 2.5 Z" fill="currentColor"/>' +
    '<circle cx="8.5" cy="7.4" r="1.9" fill="#fff"/>' +
    '<circle cx="17.5" cy="9.5" r="3.3" fill="currentColor"/>' +
    '<rect x="16.8" y="11.5" width="1.4" height="4.5" fill="currentColor"/>' +
    "</svg>",

  "коммерческая":
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="2.5" y="6" width="13" height="15" rx="0.8" fill="currentColor"/>' +
    '<rect x="4.5" y="8" width="2.4" height="2.4" fill="#fff"/>' +
    '<rect x="8.1" y="8" width="2.4" height="2.4" fill="#fff"/>' +
    '<rect x="11.7" y="8" width="2.4" height="2.4" fill="#fff"/>' +
    '<rect x="4.5" y="11.6" width="2.4" height="2.4" fill="#fff"/>' +
    '<rect x="8.1" y="11.6" width="2.4" height="2.4" fill="#fff"/>' +
    '<rect x="11.7" y="11.6" width="2.4" height="2.4" fill="#fff"/>' +
    '<rect x="6.5" y="16.5" width="5" height="4.5" fill="#fff"/>' +
    '<rect x="14.5" y="14" width="7" height="7" rx="1" fill="currentColor"/>' +
    '<rect x="16.8" y="12.4" width="2.4" height="2" rx="0.4" fill="currentColor"/>' +
    '<rect x="14.5" y="16.6" width="7" height="1.1" fill="#fff"/>' +
    "</svg>",

  "дачи":
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M9 4 L16.5 10 H1.5 Z" fill="currentColor"/>' +
    '<rect x="3.5" y="9.5" width="11" height="11.5" rx="0.8" fill="currentColor"/>' +
    '<rect x="7.4" y="13.5" width="3" height="7.5" rx="0.3" fill="#fff"/>' +
    '<rect x="5" y="12" width="2.3" height="2.3" fill="#fff"/>' +
    '<circle cx="19" cy="16" r="3.6" fill="currentColor"/>' +
    '<circle cx="16.4" cy="18" r="2.4" fill="currentColor"/>' +
    "</svg>",
};
