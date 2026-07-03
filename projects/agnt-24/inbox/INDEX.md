# Каталог проектов

Общий обзор бизнес-направлений. Тема: **технологии и автоматизация для рынка
недвижимости Казахстана (Алматы)**. Клиенты — риэлторы и агентства. Идея: собирать
заявки от клиентов и автоматизировать подбор объектов.

Каждый проект — самостоятельная изолированная папка в `projects/` (свой код,
зависимости и README), проекты не зависят друг от друга.

## Проекты

| Проект | Направление | Статус | Описание |
|--------|-------------|--------|----------|
| [realty-lead-bot](./realty-lead-bot/README.md) | Лидогенерация | Рабочий код | Telegram-бот: клиент описывает запрос → лид в базу (SQLite) → уведомление группе риэлторов. Подбор объектов вручную (легально). |
| [realty-nocode-agent](./realty-nocode-agent/README.md) | Поиск/подбор объектов | План (MVP на 4 недели) | No-code ИИ-агент: парсинг krisha.kz → Google Sheets → Glide (UI) → Zapier → Telegram. AI-теги и анализ фото. |
| [krisha-parser](./krisha-parser/README.md) | Парсинг данных | Рабочий код | Собственный парсер krisha.kz на Python (requests + BeautifulSoup, SQLite без дублей) — замена Octoparse. Раскладывает по разрезам: район, категория, комнатность, тип. |
| [realty-catalog](./realty-catalog/README.md) | Интерфейс / витрина | Рабочее веб-приложение | Локальный каталог объявлений «по полочкам»: группировка, фильтры, поиск, пометка «новое». Замена Glide. |
| [realty-quick-match](./realty-quick-match/README.md) | Интерфейс / поиск | MVP (веб-приложение) | Поиск объектов в стиле TikTok/Threads + 3D-карта MapLibre + двусторонний рейтинг и геймификация. По подписке для агентств. |

## Как связаны направления

1. **realty-lead-bot** — точка входа: быстро запустить поток заявок и проверить
   спрос без сложной инфраструктуры.
2. **realty-nocode-agent** — следующий шаг: автоматизировать подбор объектов под
   заявки на готовых сервисах (no-code).
3. **krisha-parser** — технический фундамент: когда спрос подтверждён, парсинг
   переводится с Octoparse на собственный модуль. Дальше — PostgreSQL и CRM.
4. **realty-catalog** — витрина для риэлтора: показывает собранные парсером объекты
   «по полочкам» (по районам/категориям/комнатности) с фильтрами и поиском.
5. **realty-quick-match** — mobile-first поиск для покупателей: лента в стиле TikTok,
   3D-карта, лиды в Telegram, рейтинг агентов; монетизация по подписке для агентств.

## Структура каталога

```
projects/
├── INDEX.md                  # этот файл — каталог всех направлений
├── realty-lead-bot/          # Telegram-бот лидогенерации (код + README + заметки)
│   ├── bot.py, config.py, storage.py, requirements.txt, .env.example, .gitignore
│   ├── source-notes.md
│   └── README.md
├── realty-nocode-agent/      # no-code план MVP (README + заметки)
│   ├── source-notes.md
│   └── README.md
├── krisha-parser/            # парсер krisha.kz (код + README)
│   ├── krisha_parser.py, requirements.txt
│   └── README.md
├── realty-catalog/           # веб-каталог объявлений (index.html + css + js + data)
│   ├── index.html, css/, js/, data/, build_data.py
│   └── README.md
└── realty-quick-match/       # TikTok-лента + 3D-карта + рейтинг (index.html + css + js + data)
    ├── index.html, css/, js/, data/, tests/, build_data.py
    └── README.md
```
