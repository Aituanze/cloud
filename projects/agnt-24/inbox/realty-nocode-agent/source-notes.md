# Исходные заметки: No-code прототип ИИ-агента по поиску недвижимости (из inbox)

> Перенесено из `inbox/Создание ии агента для поиска недвижимости.txt`.
> Это первоисточник — пошаговый план на 4 недели по сборке рабочего MVP без
> программирования, на готовых сервисах.

**Цель:** за 4 недели создать прототип, который парсит объявления с krisha.kz,
показывает их в удобном интерфейсе с фильтрами и шлёт уведомления в Telegram.

**Инструменты:**
- Парсинг → Octoparse (или ParseHub)
- Хранилище → Google Sheets
- Фронтенд → Glide
- Автоматизация → Zapier (или Make)
- Telegram-бот → @BotFather (без кода)

## Неделя 1 — Сбор данных (парсинг)

- Установить Octoparse (бесплатный тариф, ~10 000 страниц/мес).
- New Task → Advanced Mode → вставить URL поиска krisha.kz с фильтрами, например:
  `https://krisha.kz/prodazha/kvartiry/almaty/?price[to]=25000000&rooms=2`
- Выбрать данные: Заголовок, Цена, Адрес, Комнаты, Площадь, Этаж/этажность,
  Ссылка (URL), Первое фото (img src), опц. Описание.
- Настроить пагинацию (Loop → Click on element по кнопке «Следующая», лимит ~5 стр).
- Run → Export to Google Sheets.
- **Результат:** таблица с колонками `Title, Price, Address, Rooms, Area, Floor, URL, Photo`.

## Неделя 2 — Интерфейс (Glide)

- Зарегистрироваться в Glide → New App → Start with a spreadsheet → подключить таблицу.
- Макет: List/Cards, поля фото/заголовок/цена/адрес, детальный экран со ссылкой.
- Фильтры и поиск: Search, Filter по цене (слайдер) и комнатам (выпадающий список).
- Избранное: столбец `Favorite` (Checkbox) + кнопка Save + экран Favorites.
- Publish → ссылка на веб-приложение.

## Неделя 3 — AI-анализ (упрощённо)

- Текстовые теги формулой в Google Sheets, столбец `Renovation_Type`:
  ```
  =IF(REGEXMATCH(LOWER(F2); "дизайнерский|евроремонт|свежий"); "Дизайнерский";
   IF(REGEXMATCH(LOWER(F2); "требуется|старый|без ремонта"); "Требует ремонта"; "Средний"))
  ```
- Опционально — анализ фото через Zapier + Google Vision API (trigger: New Row →
  Vision Annotate Image → запись тегов в столбец). Для MVP можно пропустить.

## Неделя 4 — Уведомления в Telegram и тест

- Создать бота через @BotFather → получить токен → `/start`.
- Zapier: Trigger Google Sheets New Row → (Filter по цене/типу ремонта) →
  Action Telegram Bot Send Message (Custom Bot + токен, Chat ID через @userinfobot).
- Шаблон сообщения: Title / Price / Address / URL.
- Тест: запустить парсинг, проверить уведомления, дать ссылку Glide 2-3 риэлторам,
  собрать обратную связь.

## Типовые проблемы и решения

- Octoparse не видит элементы → пересоздать задачу в Advanced Mode, использовать XPath.
- Krisha блокирует/капча → увеличить задержки 5-10 сек, Rotating User-Agent, либо ParseHub.
- Glide не обновляет данные → включить Auto-update или обновлять вручную.
- Zapier не видит строки → выбрать триггер New Row, убедиться в наличии заголовков.
- Telegram не шлёт → проверить токен и Chat ID, Test & Continue в Zapier.

## Следующие шаги после MVP

1. Заменить Octoparse на собственный парсер на Python (Playwright, ротация прокси).
2. Перенести данные из Google Sheets в PostgreSQL.
3. Регистрация пользователей, разграничение доступа, личные избранные.
4. Полноценный AI-анализ фото (модель на казахстанских квартирах).
5. Интеграция с CRM (AmoCRM, YClients) через REST API / коннектор.

## Полезные ссылки

- Octoparse: https://www.octoparse.com/
- Glide: https://www.glideapps.com/
- Zapier (Sheets → Telegram): https://zapier.com/apps/google-sheets/integrations/telegram
- Google Vision API: https://cloud.google.com/vision/docs/quickstart-client-libraries
