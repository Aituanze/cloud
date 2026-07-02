# -*- coding: utf-8 -*-
"""
Парсер объявлений с krisha.kz (этап 2).

Заготовка на requests + BeautifulSoup. Собирает карточки объявлений со страницы
поиска и сохраняет в SQLite с разбивкой по разрезам:
  - район (district)        — извлекается из адреса
  - категория (category)    — квартиры / дома / коммерческая / участки (из URL)
  - тип сделки (deal_type)   — продажа / аренда (из URL)
  - тип жилья (building_type)— новостройка / вторичка (эвристика)
  - комнатность (rooms)      — число комнат (из заголовка)
  - площадь, этаж/этажность, цена числом

Селекторы и справочники вынесены в начало файла — их легко поправить.

ВНИМАНИЕ:
- Уважайте robots.txt и нагрузку на сайт: используйте задержки между запросами.
- При блокировках (капча) понадобится браузерный парсинг (Playwright) и прокси.
- Используйте парсинг только для личных нужд / MVP, соблюдая правила сайта.
"""

import csv
import logging
import re
import sqlite3
import time
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# --- Настройки ---
BASE_URL = "https://krisha.kz"

# Список поисковых ссылок. Категория и тип сделки определяются из самого URL
# (по пути /prodazha|arenda/ и /kvartiry|doma|.../). Добавляйте свои ссылки —
# с нужными фильтрами по району, цене, комнатам.
SEARCH_URLS = [
    # Все основные категории по Алматы (продажа). При необходимости поправьте
    # пути под актуальные ссылки krisha.kz и добавьте фильтры (район, цена, комнаты).
    "https://krisha.kz/prodazha/kvartiry/almaty/",                  # квартиры
    "https://krisha.kz/prodazha/doma/almaty/",                      # дома
    "https://krisha.kz/prodazha/uchastkov/almaty/",                 # участки
    "https://krisha.kz/prodazha/kommercheskaya-nedvizhimost/almaty/",  # коммерческая
    "https://krisha.kz/prodazha/dachi/almaty/",                     # дачи
]

MAX_PAGES = 5
REQUEST_DELAY_SEC = 5  # пауза между страницами, чтобы не перегружать сайт
DB_PATH = str(Path(__file__).resolve().parent / "listings.db")
CSV_PATH = str(Path(__file__).resolve().parent / "listings.csv")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "ru,en;q=0.9",
}

# --- Селекторы (поправьте, если изменится вёрстка сайта) ---
SEL_CARD = "div.a-card"
SEL_TITLE = "a.a-card__title"
SEL_PRICE = "div.a-card__price"
SEL_ADDRESS = "div.a-card__subtitle"
SEL_LINK = "a.a-card__title"

# --- Справочники для разбора ---
# Категория недвижимости по сегменту URL.
CATEGORY_BY_SLUG = {
    "kvartiry": "квартиры",
    "doma": "дома",
    "uchastki": "участки",
    "uchastkov": "участки",
    "dachi": "дачи",
    "komnaty": "комнаты",
    "kommercheskaya-nedvizhimost": "коммерческая",
    "kommercheskie-pomeshcheniya": "коммерческая",
    "magaziny": "коммерческая",
    "ofisy": "коммерческая",
}
# Тип сделки по сегменту URL.
DEAL_BY_SLUG = {
    "prodazha": "продажа",
    "arenda": "аренда",
}
# Районы Алматы (для надёжного распознавания в адресе).
ALMATY_DISTRICTS = [
    "Алатауский",
    "Алмалинский",
    "Ауэзовский",
    "Бостандыкский",
    "Жетысуский",
    "Медеуский",
    "Наурызбайский",
    "Турксибский",
]


@dataclass
class Listing:
    deal_type: str
    category: str
    rooms: Optional[int]
    area: Optional[float]
    floor: Optional[int]
    total_floors: Optional[int]
    district: str
    building_type: str
    title: str
    price_text: str
    price_value: Optional[int]
    address: str
    url: str


def init_db(db_path: str = DB_PATH) -> None:
    """Создаёт таблицу listings, если её нет, и аддитивно доводит схему до актуальной.

    ВАЖНО: никогда не удаляет и не пересоздаёт таблицу — там живые собранные
    данные (не воспроизводятся бесплатно). Новые поля добавляются только
    через ALTER TABLE ADD COLUMN.
    """
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS listings (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                deal_type     TEXT,
                category      TEXT,
                rooms         INTEGER,
                area          REAL,
                floor         INTEGER,
                total_floors  INTEGER,
                district      TEXT,
                building_type TEXT,
                title         TEXT,
                price_text    TEXT,
                price_value   INTEGER,
                address       TEXT,
                url           TEXT UNIQUE,
                first_seen    TEXT
            )
            """
        )
        cols_now = [r[1] for r in conn.execute("PRAGMA table_info(listings)")]
        if "condition" not in cols_now:
            conn.execute("ALTER TABLE listings ADD COLUMN condition TEXT")


def save_listing(listing: Listing, db_path: str = DB_PATH) -> bool:
    """Сохраняет объявление (только первое вхождение). Возвращает True, если оно новое.

    Дубли по URL не добавляются — остаётся только самое первое объявление и его
    дата первого появления (first_seen), по которой считается «новинка за 24 часа».
    """
    first_seen = datetime.now().isoformat(timespec="seconds")
    with sqlite3.connect(db_path) as conn:
        try:
            conn.execute(
                """
                INSERT INTO listings (
                    deal_type, category, rooms, area, floor, total_floors,
                    district, building_type, title, price_text, price_value,
                    address, url, first_seen
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    listing.deal_type, listing.category, listing.rooms, listing.area,
                    listing.floor, listing.total_floors, listing.district,
                    listing.building_type, listing.title, listing.price_text,
                    listing.price_value, listing.address, listing.url, first_seen,
                ),
            )
            return True
        except sqlite3.IntegrityError:
            return False  # уже есть (по url) — дубль, пропускаем


def _text(node) -> str:
    return node.get_text(strip=True) if node else ""


def parse_category_deal(url: str) -> tuple[str, str]:
    """Определяет тип сделки и категорию по пути URL."""
    deal, category = "", ""
    for slug in re.split(r"[/?]", url):
        if slug in DEAL_BY_SLUG:
            deal = DEAL_BY_SLUG[slug]
        if slug in CATEGORY_BY_SLUG:
            category = CATEGORY_BY_SLUG[slug]
    return deal, category


def parse_rooms(title: str) -> Optional[int]:
    if re.search(r"студи", title, re.IGNORECASE):
        return 0  # 0 = студия
    m = re.search(r"(\d+)\s*-?\s*комнат", title, re.IGNORECASE)
    return int(m.group(1)) if m else None


def parse_area(title: str) -> Optional[float]:
    m = re.search(r"([\d]+[.,]?\d*)\s*м²", title)
    if not m:
        return None
    return float(m.group(1).replace(",", "."))


def parse_floor(title: str) -> tuple[Optional[int], Optional[int]]:
    m = re.search(r"(\d+)\s*/\s*(\d+)\s*этаж", title)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r"(\d+)\s*этаж", title)
    if m:
        return int(m.group(1)), None
    return None, None


def parse_price(price_text: str) -> Optional[int]:
    digits = re.sub(r"[^\d]", "", price_text)
    return int(digits) if digits else None


def parse_district(address: str) -> str:
    for d in ALMATY_DISTRICTS:
        if d in address:
            return d
    m = re.search(r"([А-ЯЁA-Z][\w-]+)\s+р-н", address)
    if m:
        return m.group(1)
    # населённый пункт за пределами районов Алматы (посёлок / город / село)
    for seg in address.split(","):
        seg = seg.strip()
        if re.match(r"^(пос\.|п\.|г\.|с\.|село|город)\s", seg, re.IGNORECASE):
            return seg
    return "не указан"


def parse_building_type(address: str, price_text: str) -> str:
    text = address.lower()
    if "жк" in text or "от застройщик" in text or price_text.strip().startswith("от"):
        return "новостройка"
    return "вторичка"


# --- Состояние (ремонт) — только с detail-страницы объявления ---
# На карточках списка этого поля нет: krisha.kz показывает его в блоке
# характеристик объявления как data-name="flat.renovation" (квартиры)
# или data-name="house.renewal" (дома).
COND_DATA_NAMES = ("flat.renovation", "house.renewal")


def normalize_condition(raw: str) -> Optional[str]:
    """Сводит текст krisha.kz к одной из 3 категорий фильтра."""
    if not raw:
        return None
    t = raw.lower()
    if "черновая" in t or "без отделки" in t:
        return "черновая"
    if "ремонт" in t and ("нужен" in t or "требуе" in t):
        return "ремонт"
    if "чистовая" in t or "хорош" in t or "евроремонт" in t or "отличн" in t or "сред" in t:
        return "чистовая"
    return None


def parse_condition(html: str) -> Optional[str]:
    """Извлекает состояние объекта со страницы объявления (не со страницы списка)."""
    for name in COND_DATA_NAMES:
        m = re.search(
            r'data-name="%s"[\s\S]{0,300}?offer__advert-short-info">([^<]+)<' % re.escape(name),
            html,
        )
        if m:
            return normalize_condition(m.group(1).strip())
    return None


def fetch_with_status(url: str) -> tuple[Optional[str], Optional[int]]:
    """Как fetch(), но также возвращает HTTP-статус, чтобы отличать
    404 (объявление снято — ожидаемо для старых записей) от реальной
    блокировки (403/429/сетевые обрывы)."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        if resp.status_code == 404:
            return None, 404
        resp.raise_for_status()
        return resp.text, resp.status_code
    except requests.RequestException as exc:
        logger.error("Ошибка запроса %s: %s", url, exc)
        status = getattr(getattr(exc, "response", None), "status_code", None)
        return None, status


def enrich_conditions(db_path: str = DB_PATH, limit: Optional[int] = None,
                       delay: float = REQUEST_DELAY_SEC) -> dict:
    """Догружает поле condition, заходя на detail-страницы объявлений.

    Отдельный шаг от run(): по запросу на каждое объявление, поэтому
    дороже и рискованнее по капче — запускать вручную, не в общем cron.
    Уже проверенные объявления (condition IS NOT NULL, включая '') не
    запрашиваются повторно. 404 (объявление снято) — это ожидаемо для
    старых объявлений и не считается признаком блокировки.
    """
    init_db(db_path)
    with sqlite3.connect(db_path) as conn:
        q = "SELECT id, url FROM listings WHERE condition IS NULL AND url IS NOT NULL"
        if limit:
            q += f" LIMIT {int(limit)}"
        rows = conn.execute(q).fetchall()

    processed = 0
    updated = 0
    gone = 0
    blocks = 0
    for row_id, url in rows:
        html, status = fetch_with_status(url)
        if status == 404:
            gone += 1
            processed += 1
            with sqlite3.connect(db_path) as conn:
                conn.execute("UPDATE listings SET condition = ? WHERE id = ?", ("", row_id))
            time.sleep(delay)
            continue
        if not html:
            blocks += 1
            if blocks >= 3:
                logger.warning("Похоже на блокировку (не 404) — останавливаю enrich_conditions досрочно.")
                break
            continue
        cond = parse_condition(html)
        with sqlite3.connect(db_path) as conn:
            conn.execute("UPDATE listings SET condition = ? WHERE id = ?", (cond or "", row_id))
        processed += 1
        if cond:
            updated += 1
        time.sleep(delay)

    logger.info("Состояние: найдено у %s из %s проверенных (%s снято с публикации).", updated, processed, gone)
    return {"checked": processed, "updated": updated, "gone": gone}


def parse_page(html: str, deal_type: str, category: str) -> list[Listing]:
    soup = BeautifulSoup(html, "html.parser")
    listings: list[Listing] = []
    for card in soup.select(SEL_CARD):
        title_node = card.select_one(SEL_TITLE)
        link_node = card.select_one(SEL_LINK)
        href = link_node.get("href", "") if link_node else ""
        url = href if href.startswith("http") else f"{BASE_URL}{href}"
        title = _text(title_node)
        price_text = _text(card.select_one(SEL_PRICE))
        address = _text(card.select_one(SEL_ADDRESS))
        floor, total_floors = parse_floor(title)
        listings.append(
            Listing(
                deal_type=deal_type,
                category=category,
                rooms=parse_rooms(title),
                area=parse_area(title),
                floor=floor,
                total_floors=total_floors,
                district=parse_district(address),
                building_type=parse_building_type(address, price_text),
                title=title,
                price_text=price_text,
                price_value=parse_price(price_text),
                address=address,
                url=url,
            )
        )
    return listings


def fetch(url: str) -> Optional[str]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
        return resp.text
    except requests.RequestException as exc:
        logger.error("Ошибка запроса %s: %s", url, exc)
        return None


def export_csv(db_path: str = DB_PATH, csv_path: str = CSV_PATH) -> int:
    with sqlite3.connect(db_path) as conn:
        cur = conn.execute("SELECT * FROM listings ORDER BY category, district, rooms")
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
    # utf-8-sig — чтобы кириллица корректно открывалась в Excel
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(cols)
        writer.writerows(rows)
    return len(rows)


def print_breakdown(db_path: str = DB_PATH) -> None:
    """Выводит сводку по разрезам."""
    with sqlite3.connect(db_path) as conn:
        def group(field: str):
            return conn.execute(
                f"SELECT COALESCE({field}, '—'), COUNT(*) FROM listings "
                f"GROUP BY {field} ORDER BY COUNT(*) DESC"
            ).fetchall()

        logger.info("--- Сводка ---")
        for label, field in (
            ("Категории", "category"),
            ("Типы сделок", "deal_type"),
            ("Тип жилья", "building_type"),
            ("Комнатность", "rooms"),
            ("Районы", "district"),
        ):
            parts = ", ".join(f"{k}: {v}" for k, v in group(field))
            logger.info("%s → %s", label, parts)


def run() -> dict:
    """Запускает парсинг и возвращает статистику: {total_new, by_district}."""
    init_db()
    total_new = 0
    new_by_district: Counter = Counter()

    for search_url in SEARCH_URLS:
        deal_type, category = parse_category_deal(search_url)
        logger.info("Источник: %s/%s — %s", deal_type or "?", category or "?", search_url)
        for page in range(1, MAX_PAGES + 1):
            sep = "&" if "?" in search_url else "?"
            url = f"{search_url}{sep}page={page}"
            logger.info("Страница %s: %s", page, url)

            html = fetch(url)
            if not html:
                break

            listings = parse_page(html, deal_type, category)
            if not listings:
                logger.info("Объявления не найдены — последняя страница или изменилась вёрстка.")
                break

            for listing in listings:
                if save_listing(listing):
                    total_new += 1
                    new_by_district[listing.district] += 1

            time.sleep(REQUEST_DELAY_SEC)

    logger.info("Готово. Новых объявлений: %s", total_new)
    print_breakdown()
    count = export_csv()
    logger.info("Выгружено в CSV: %s строк → %s", count, CSV_PATH)
    return {"total_new": total_new, "by_district": dict(new_by_district)}


if __name__ == "__main__":
    import sys

    if "--enrich-condition" in sys.argv:
        limit = None
        idx = sys.argv.index("--enrich-condition")
        if idx + 1 < len(sys.argv) and sys.argv[idx + 1].isdigit():
            limit = int(sys.argv[idx + 1])
        stats = enrich_conditions(limit=limit)
        print(f"Состояние: найдено у {stats['updated']} из {stats['checked']} объявлений")
    else:
        stats = run()
        print(f"Итог: +{stats['total_new']} новых объявлений")
