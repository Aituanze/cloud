# Промпт: Генерация тестовых данных для района

Добавь **[N]** синтетических объявлений для района **[РАЙОН]** в `listings.js`.

**Параметры:**
- district: `[district_id]` (medeu / bostandyk / almaly / auezov / ...)
- type: `[apt / house / land / commercial]`
- mode: `active`

**Требования к данным:**
- Цены: реалистичные для района (см. realtor-domain-kz скилл)
- buildingType: Кирпич 35% / Монолит 30% / Монолит-кирпич 20% / Панель 15%
- rooms: 1-4 + студии (0), реалистичное распределение
- firstSeen: последние 7 дней с разбросом
- photoBg: из тёплой палитры (#e8e2d9, #ddd5c8, #e5ddd0, ...)
- scene: living/bedroom/kitchen/exterior — реалистичное распределение
- id: уникальный формат `"synth-[district]-[число]"`
- address: реалистичный для района (улицы, ЖК)

**Добавить** в конец массива LISTINGS в `projects/agnt-24-app/data/listings.js`.

После добавления убедись что app.js правильно считает count для этого района в DISTRICTS.
