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
import json
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
OWNER_ONLY_FILTER = "das[who]=1"  # только объявления от хозяина, без агентских

SEARCH_URLS = [
    # Все основные категории по Алматы (продажа). При необходимости поправьте
    # пути под актуальные ссылки krisha.kz и добавьте фильтры (район, цена, комнаты).
    f"https://krisha.kz/prodazha/kvartiry/almaty/?{OWNER_ONLY_FILTER}",                  # квартиры
    f"https://krisha.kz/prodazha/doma/almaty/?{OWNER_ONLY_FILTER}",                      # дома
    f"https://krisha.kz/prodazha/uchastkov/almaty/?{OWNER_ONLY_FILTER}",                 # участки
    f"https://krisha.kz/prodazha/kommercheskaya-nedvizhimost/almaty/?{OWNER_ONLY_FILTER}",  # коммерческая
    f"https://krisha.kz/prodazha/dachi/almaty/?{OWNER_ONLY_FILTER}",                     # дачи

    # Талгар — отдельный населённый пункт в krisha.kz (не район Алматы, а
    # пригород/город Алматинской области), поэтому свои ссылки на сегмент
    # /talgar/, а не фильтр внутри /almaty/. Адреса объявлений там не содержат
    # "р-н" — район присваивается settlement-override'ом в run(), см.
    # SETTLEMENT_DISTRICT_OVERRIDE ниже.
    f"https://krisha.kz/prodazha/kvartiry/talgar/?{OWNER_ONLY_FILTER}",                  # квартиры (Талгар)
    f"https://krisha.kz/prodazha/doma/talgar/?{OWNER_ONLY_FILTER}",                      # дома (Талгар)
    f"https://krisha.kz/prodazha/uchastkov/talgar/?{OWNER_ONLY_FILTER}",                 # участки (Талгар)
    f"https://krisha.kz/prodazha/kommercheskaya-nedvizhimost/talgar/?{OWNER_ONLY_FILTER}",  # коммерческая (Талгар)
    f"https://krisha.kz/prodazha/dachi/talgar/?{OWNER_ONLY_FILTER}",                     # дачи (Талгар)

    # Бесагаш — посёлок Алматинской области рядом с Талгаром (алиас на
    # krisha.kz "besagash-dzerzhinskoe", не просто "besagash" — сверено
    # по канонiческому списку населённых пунктов на странице поиска).
    # Бакетируется в тот же район "Талгарский", отдельно помечается как
    # посёлок "Бесагаш" в microdistrict, см. parse_microdistrict().
    f"https://krisha.kz/prodazha/kvartiry/besagash-dzerzhinskoe/?{OWNER_ONLY_FILTER}",
    f"https://krisha.kz/prodazha/doma/besagash-dzerzhinskoe/?{OWNER_ONLY_FILTER}",
    f"https://krisha.kz/prodazha/uchastkov/besagash-dzerzhinskoe/?{OWNER_ONLY_FILTER}",
    f"https://krisha.kz/prodazha/kommercheskaya-nedvizhimost/besagash-dzerzhinskoe/?{OWNER_ONLY_FILTER}",
    f"https://krisha.kz/prodazha/dachi/besagash-dzerzhinskoe/?{OWNER_ONLY_FILTER}",
]

# Населённые пункты за пределами районов Алматы, для которых район
# определяется по сегменту URL, а не по тексту адреса (там просто нет "р-н").
SETTLEMENT_DISTRICT_OVERRIDE = {
    "talgar": "Талгарский",
    "besagash-dzerzhinskoe": "Талгарский",
}

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

# Микрорайон/жилмассив внутри районов Алматы — в адресе идёт как "мкр X" сразу
# после "<Район> р-н, ". Захватываем слово, опционально с "-N"/"-й" (Шанырак-2,
# Айгерим-1, 20-й) и опциональным вторым словом (Заря Востока, 6-й градокомплекс),
# останавливаясь перед номером дома/запятой.
MICRODISTRICT_RE = re.compile(r"мкр\.?\s+(\w+(?:-[\wа-яёА-ЯЁ]+)?(?:\s+[А-ЯЁа-яё]+)?)")

# Талгарский район не делится на микрорайоны — делится на посёлки/сёла вокруг
# Талгара (не сам город Талгар — туда специально не углубляемся). Список — то,
# что реально встречается в адресах наших объявлений + Бесагаш (явно попросил
# владелец), сверено с канонiческими алиасами krisha.kz для Алматинской области.
# "ң"/"н" — обе написания одного слова (Кеңдала/Кендала) нормализуются перед сверкой.
TALGAR_SETTLEMENTS = [
    "Бесагаш",
    "Кендала",
    "Актас",
    "Талдыбулак",
    "Алмалык",
    "Панфилово",
    "Отеген батыр",
]


def parse_microdistrict(address: str, district: str) -> Optional[str]:
    """Извлекает микрорайон (8 р-нов Алматы) или посёлок (Талгарский) из адреса."""
    if district == "Талгарский":
        norm = address.replace("ң", "н").replace("Ң", "Н").lower()
        for name in TALGAR_SETTLEMENTS:
            if name.replace("ң", "н").lower() in norm:
                return name
        return None
    m = MICRODISTRICT_RE.search(address)
    return m.group(1).strip() if m else None


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
    microdistrict: Optional[str] = None


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
        if "photos" not in cols_now:
            conn.execute("ALTER TABLE listings ADD COLUMN photos TEXT")
        if "seller_type" not in cols_now:
            conn.execute("ALTER TABLE listings ADD COLUMN seller_type TEXT")
        if "seller_agency" not in cols_now:
            conn.execute("ALTER TABLE listings ADD COLUMN seller_agency TEXT")
        if "microdistrict" not in cols_now:
            conn.execute("ALTER TABLE listings ADD COLUMN microdistrict TEXT")
        if "year_built" not in cols_now:
            conn.execute("ALTER TABLE listings ADD COLUMN year_built INTEGER")


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
                    address, url, first_seen, microdistrict
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    listing.deal_type, listing.category, listing.rooms, listing.area,
                    listing.floor, listing.total_floors, listing.district,
                    listing.building_type, listing.title, listing.price_text,
                    listing.price_value, listing.address, listing.url, first_seen,
                    listing.microdistrict,
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


# --- Год постройки — тоже только с detail-страницы, атрибут общий для
# квартир и домов (у квартиры это год постройки её ЖК/дома, не самой квартиры).
YEAR_DATA_NAME = "house.year"


def parse_year(html: str) -> Optional[int]:
    """Извлекает год постройки со страницы объявления."""
    m = re.search(
        r'data-name="%s"[\s\S]{0,300}?offer__advert-short-info">(\d{4})<' % re.escape(YEAR_DATA_NAME),
        html,
    )
    return int(m.group(1)) if m else None


def _extract_json_object(html: str, marker: str) -> Optional[dict]:
    """Вырезает JSON-объект, начинающийся с marker (например '"seller":{'), считая
    вложенные фигурные скобки, и парсит его. Regex не подходит — внутри seller
    может быть вложенный объект agency."""
    idx = html.find(marker)
    if idx == -1:
        return None
    start = idx + len(marker) - 1  # позиция открывающей '{'
    depth = 0
    for i in range(start, len(html)):
        if html[i] == "{":
            depth += 1
        elif html[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(html[start:i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def parse_seller(html: str) -> tuple[Optional[str], Optional[str]]:
    """Извлекает тип продавца со страницы объявления: 'owner' (хозяин) или
    'specialist'/'company' (агент/агентство) из встроенного в HTML JSON
    ({"seller":{"type":"owner",...}} или {..."type":"specialist","agency":{"name":"..."}})."""
    obj = _extract_json_object(html, '"seller":{')
    if not obj:
        return None, None
    seller_type = obj.get("type")
    agency = obj.get("agency")
    agency_name = agency.get("name") if isinstance(agency, dict) else None
    return seller_type, agency_name


# --- Фото — только ссылки на CDN krisha, без скачивания и хранения у себя ---
# krisha раздаёт фото объявлений через krisha-photos.kcdn.online в нескольких
# готовых размерах (никакой защиты от хотлинка, cache-control: max-age=7 дней).
# ВАЖНО: не все размеры есть у всех фото галереи — только у "главного" фото
# генерируются все варианты (120x90…750x470). Остальные фото галереи имеют
# только 120x90/200x150/280x175/750x470. Берём 280x175 — присутствует везде.
PHOTO_SIZE = "280x175"
PHOTO_RE_TEMPLATE = (
    r"(https://krisha-photos\.kcdn\.online/webp/[0-9a-f]{2}/[0-9a-f-]{36}/(\d+)-%s\.jpg)"
)


def parse_photos(html: str, max_photos: int = 5, size: str = PHOTO_SIZE) -> list[str]:
    """Собирает до max_photos ссылок на фото объявления (CDN krisha, фиксированный размер)."""
    pattern = re.compile(PHOTO_RE_TEMPLATE % re.escape(size))
    seen_idx = set()
    found: list[tuple[int, str]] = []
    for m in pattern.finditer(html):
        url, idx = m.group(1), int(m.group(2))
        if idx in seen_idx:
            continue
        seen_idx.add(idx)
        found.append((idx, url))
    found.sort(key=lambda x: x[0])
    return [u for _, u in found[:max_photos]]


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


def enrich_details(db_path: str = DB_PATH, limit: Optional[int] = None,
                    delay: float = REQUEST_DELAY_SEC) -> dict:
    """Догружает condition, photos и year_built с detail-страниц — один запрос на
    объявление закрывает все три поля, т.к. все берутся с одной и той же страницы.

    Отдельный шаг от run(): по запросу на объявление, поэтому дороже и рискованнее
    по капче — запускать вручную, не в общем cron. Строки, где photos уже заполнены
    (включая '[]'), повторно не трогаем. 404 (объявление снято) — это ожидаемо для
    старых объявлений и не считается признаком блокировки.
    """
    init_db(db_path)
    with sqlite3.connect(db_path) as conn:
        q = "SELECT id, url FROM listings WHERE photos IS NULL AND url IS NOT NULL"
        if limit:
            q += f" LIMIT {int(limit)}"
        rows = conn.execute(q).fetchall()

    processed = 0
    updated_cond = 0
    updated_photos = 0
    updated_year = 0
    gone = 0
    blocks = 0
    for row_id, url in rows:
        html, status = fetch_with_status(url)
        if status == 404:
            gone += 1
            processed += 1
            with sqlite3.connect(db_path) as conn:
                conn.execute("UPDATE listings SET condition = ?, photos = ? WHERE id = ?", ("", "[]", row_id))
            time.sleep(delay)
            continue
        if not html:
            blocks += 1
            if blocks >= 3:
                logger.warning("Похоже на блокировку (не 404) — останавливаю enrich_details досрочно.")
                break
            continue
        cond = parse_condition(html)
        photos = parse_photos(html)
        year = parse_year(html)
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "UPDATE listings SET condition = ?, photos = ?, year_built = ? WHERE id = ?",
                (cond or "", json.dumps(photos, ensure_ascii=False), year, row_id),
            )
        processed += 1
        if cond:
            updated_cond += 1
        if photos:
            updated_photos += 1
        if year:
            updated_year += 1
        time.sleep(delay)

    logger.info("Детали: condition у %s, фото у %s, год постройки у %s из %s проверенных (%s снято с публикации).",
                updated_cond, updated_photos, updated_year, processed, gone)
    return {"checked": processed, "updated_condition": updated_cond, "updated_year": updated_year,
            "updated_photos": updated_photos, "gone": gone}


def enrich_seller_type(db_path: str = DB_PATH, limit: Optional[int] = None,
                        delay: float = REQUEST_DELAY_SEC) -> dict:
    """Проверяет тип продавца (owner/specialist/company) на detail-странице для
    объявлений, у которых seller_type ещё не заполнен.

    Нужно для чистки старых записей: das[who]=1 в SEARCH_URLS отсекает агентские
    объявления только при парсинге НОВЫХ объявлений (с 2026-07-04), но не трогает
    то, что уже лежит в базе с прошлых прогонов без фильтра. build_app_data.py
    должен использовать seller_type, чтобы не показывать агентские объявления
    под видом хозяйских.
    """
    init_db(db_path)
    with sqlite3.connect(db_path) as conn:
        q = "SELECT id, url FROM listings WHERE seller_type IS NULL AND url IS NOT NULL"
        if limit:
            q += f" LIMIT {int(limit)}"
        rows = conn.execute(q).fetchall()

    processed = 0
    owners = 0
    agencies = 0
    gone = 0
    blocks = 0
    for row_id, url in rows:
        html, status = fetch_with_status(url)
        if status == 404:
            gone += 1
            processed += 1
            with sqlite3.connect(db_path) as conn:
                conn.execute("UPDATE listings SET seller_type = ? WHERE id = ?", ("gone", row_id))
            time.sleep(delay)
            continue
        if not html:
            blocks += 1
            if blocks >= 3:
                logger.warning("Похоже на блокировку (не 404) — останавливаю enrich_seller_type досрочно.")
                break
            continue
        seller_type, agency_name = parse_seller(html)
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "UPDATE listings SET seller_type = ?, seller_agency = ? WHERE id = ?",
                (seller_type or "unknown", agency_name, row_id),
            )
        processed += 1
        if seller_type == "owner":
            owners += 1
        elif seller_type:
            agencies += 1
        time.sleep(delay)

    logger.info("Продавец: хозяин у %s, агент/агентство у %s из %s проверенных (%s снято с публикации).",
                owners, agencies, processed, gone)
    return {"checked": processed, "owners": owners, "agencies": agencies, "gone": gone}


def enrich_year_built(db_path: str = DB_PATH, limit: Optional[int] = None,
                       delay: float = REQUEST_DELAY_SEC) -> dict:
    """Догружает year_built (год постройки) для старых записей, собранных ДО того,
    как появилось это поле — enrich_details() трогает им только новые строки
    (photos IS NULL), тут отдельный проход по всей базе.

    Объявления без атрибута "Год постройки" на detail-странице (участки, часть
    коммерческой недвижимости) и снятые с публикации (404) помечаются year_built = -1
    (проверено, данных нет) — чтобы не пере-сканировать их при повторных запусках.
    """
    init_db(db_path)
    with sqlite3.connect(db_path) as conn:
        q = "SELECT id, url FROM listings WHERE year_built IS NULL AND url IS NOT NULL"
        if limit:
            q += f" LIMIT {int(limit)}"
        rows = conn.execute(q).fetchall()

    processed = 0
    found = 0
    gone = 0
    blocks = 0
    for row_id, url in rows:
        html, status = fetch_with_status(url)
        if status == 404:
            gone += 1
            processed += 1
            with sqlite3.connect(db_path) as conn:
                conn.execute("UPDATE listings SET year_built = -1 WHERE id = ?", (row_id,))
            time.sleep(delay)
            continue
        if not html:
            blocks += 1
            if blocks >= 3:
                logger.warning("Похоже на блокировку (не 404) — останавливаю enrich_year_built досрочно.")
                break
            continue
        year = parse_year(html)
        with sqlite3.connect(db_path) as conn:
            conn.execute("UPDATE listings SET year_built = ? WHERE id = ?", (year if year else -1, row_id))
        processed += 1
        if year:
            found += 1
        time.sleep(delay)

    logger.info("Год постройки: найден у %s из %s проверенных (%s снято с публикации).",
                found, processed, gone)
    return {"checked": processed, "found": found, "gone": gone}


def parse_page(html: str, deal_type: str, category: str, district_override: Optional[str] = None) -> list[Listing]:
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
        district = district_override or parse_district(address)
        listings.append(
            Listing(
                deal_type=deal_type,
                category=category,
                rooms=parse_rooms(title),
                area=parse_area(title),
                floor=floor,
                total_floors=total_floors,
                district=district,
                building_type=parse_building_type(address, price_text),
                title=title,
                price_text=price_text,
                price_value=parse_price(price_text),
                address=address,
                url=url,
                microdistrict=parse_microdistrict(address, district),
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
        district_override = next(
            (d for slug, d in SETTLEMENT_DISTRICT_OVERRIDE.items() if f"/{slug}/" in search_url),
            None,
        )
        logger.info("Источник: %s/%s — %s", deal_type or "?", category or "?", search_url)
        for page in range(1, MAX_PAGES + 1):
            sep = "&" if "?" in search_url else "?"
            url = f"{search_url}{sep}page={page}"
            logger.info("Страница %s: %s", page, url)

            html = fetch(url)
            if not html:
                break

            listings = parse_page(html, deal_type, category, district_override)
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

    flag = "--enrich-details" if "--enrich-details" in sys.argv else (
        "--enrich-condition" if "--enrich-condition" in sys.argv else (
        "--enrich-seller" if "--enrich-seller" in sys.argv else (
        "--enrich-year" if "--enrich-year" in sys.argv else None
    )))
    if flag == "--enrich-seller":
        limit = None
        idx = sys.argv.index(flag)
        if idx + 1 < len(sys.argv) and sys.argv[idx + 1].isdigit():
            limit = int(sys.argv[idx + 1])
        stats = enrich_seller_type(limit=limit)
        print(f"Продавец: хозяин у {stats['owners']}, агент/агентство у {stats['agencies']} "
              f"из {stats['checked']} проверенных")
    elif flag == "--enrich-year":
        limit = None
        idx = sys.argv.index(flag)
        if idx + 1 < len(sys.argv) and sys.argv[idx + 1].isdigit():
            limit = int(sys.argv[idx + 1])
        stats = enrich_year_built(limit=limit)
        print(f"Год постройки: найден у {stats['found']} из {stats['checked']} проверенных")
    elif flag:
        limit = None
        idx = sys.argv.index(flag)
        if idx + 1 < len(sys.argv) and sys.argv[idx + 1].isdigit():
            limit = int(sys.argv[idx + 1])
        stats = enrich_details(limit=limit)
        print(f"Детали: condition у {stats['updated_condition']}, "
              f"фото у {stats['updated_photos']} из {stats['checked']} объявлений")
    else:
        stats = run()
        print(f"Итог: +{stats['total_new']} новых объявлений")
