# BACKLOG — 24streets

## IN PROGRESS
<!-- текущие задачи -->

## TODO

### Фаза 1 — Деплой инфраструктуры
- [ ] Создать GitHub-репозиторий и запушить `inbox/realty-lead-bot/`
- [ ] Создать проект на Railway → подключить репо → добавить env vars (TELEGRAM_TOKEN, TELEGRAM_GROUP_ID)
- [ ] Создать `.env` из `.env.example` на сервере
- [ ] Проверить: бот отвечает на `/start` в Telegram

### Фаза 1 — Автопайплайн
- [ ] Настроить автозапуск через cron или Task Scheduler: `python pipeline.py --cron`

### Фаза 2 — Деплой каталогов
- [ ] Создать GitHub Pages / Netlify для `realty-catalog/`
- [ ] Создать GitHub Pages / Netlify для `realty-quick-match/`
- [ ] Добавить GitHub Action для авто-пуша обновлённых `data/listings.js`

### Фаза 3 — CRM
- [ ] Создать сервисный аккаунт Google Cloud → скачать `credentials.json`
- [ ] Установить `USE_GOOGLE_SHEETS=true` в `.env` бота
- [ ] Проверить, что лиды пишутся в Google Sheets
- [ ] Настроить еженедельный отчёт: `python reporter.py` по расписанию

### Фаза 4 — Масштабирование (Месяц 2–3)
- [ ] Перейти на PostgreSQL (Supabase)
- [ ] Мульти-агент: добавить agent_id в leads.db
- [ ] AI-теги фото (Google Vision API)
- [ ] SEO для realty-quick-match (мета-теги, Open Graph)

## DONE

| Задача | Дата | Результат |
|--------|------|-----------|
| Создать pipeline.py (мастер-скрипт) | 2026-06-28 | `inbox/pipeline.py` — цепочка парсер → build_data × 2 → Telegram |
| Добавить APScheduler в krisha_parser | 2026-06-28 | `run()` возвращает stats dict, `pipeline.py --cron` запускает по расписанию |
| Создать match_lead.py | 2026-06-28 | `realty-lead-bot/match_lead.py` — автоподбор объектов под текст лида |
| Интегрировать матчинг в bot.py | 2026-06-28 | После нового лида бот присылает агентам топ-5 объектов |
| Добавить LISTINGS_DB_PATH в config | 2026-06-28 | `config.py` + `.env.example` обновлены |
| Создать reporter.py | 2026-06-28 | `inbox/reporter.py` — еженедельный Telegram-отчёт по лидам и объектам |
| Railway deployment files | 2026-06-28 | `Procfile` + `runtime.txt` в `realty-lead-bot/` |
| Тест pipeline.py локально | 2026-06-28 | 811 объявлений спарсено, оба build_data.py прошли ✅ |
| Создать inbox/.env + venv | 2026-06-28 | `.venv` в `inbox/`, все зависимости установлены |
