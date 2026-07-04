"""
build_app_data.py
Читает krisha-parser/listings.db → генерирует listings.js для agnt-24-app
Запускать: python data/build_app_data.py
"""
import sqlite3, json, random, re, os, sys
sys.stdout.reconfigure(encoding='utf-8')
from datetime import datetime, timedelta
from pathlib import Path

# ── ПУТИ ─────────────────────────────────
HERE    = Path(__file__).parent
DB_PATH = HERE / '../../agnt-24/inbox/krisha-parser/listings.db'
OUT     = HERE / 'listings.js'

# ── МАППИНГИ ─────────────────────────────
DISTRICT_MAP = {
    'Бостандыкский':  'bost',
    'Алмалинский':    'alma',
    'Жетысуский':     'zhet',
    'Наурызбайский':  'naur',
    'Алатауский':     'alat',
    'Турксибский':    'turk',
    'Медеуский':      'mede',
    'Ауэзовский':     'auez',
}
TYPE_MAP = {
    'квартиры':      'apt',
    'дома':          'house',
    'участки':       'land',
    'коммерческая':  'comm',
    'дачи':          'dacha',
}
DEAL_MAP = { 'продажа': 'sale', 'аренда': 'rent' }

REALTORS = [
    {'name': 'Аружан К.',  'initial': 'А', 'color': '#e07b2a', 'rating': 4.9, 'deals': 124},
    {'name': 'Нурлан М.',  'initial': 'Н', 'color': '#2d6be4', 'rating': 4.7, 'deals':  87},
    {'name': 'Дина С.',    'initial': 'Д', 'color': '#15966b', 'rating': 4.8, 'deals': 203},
    {'name': 'Болат Е.',   'initial': 'Б', 'color': '#7055c0', 'rating': 4.6, 'deals':  61},
    {'name': 'Айгуль Т.', 'initial': 'А', 'color': '#14b89c', 'rating': 5.0, 'deals': 312},
]
ARCHIVE_CLAIMED = [
    {'name': 'Аружан К.', 'initial': 'А', 'color': '#e07b2a', 'date': '29 июня', 'rating': 4.9},
    {'name': 'Нурлан М.', 'initial': 'Н', 'color': '#2d6be4', 'date': '28 июня', 'rating': 4.7},
    {'name': 'Дина С.',   'initial': 'Д', 'color': '#15966b', 'date': '27 июня', 'rating': 4.8},
]

ARCHIVE_PHONES = [
    '+7 705 234 56 78', '+7 701 345 67 89', '+7 777 456 78 90',
    '+7 702 567 89 01', '+7 707 678 90 12', '+7 778 789 01 23',
    '+7 776 890 12 34', '+7 771 901 23 45', '+7 708 012 34 56',
]
REMOVED_DATES = [
    '30 июня 2026', '29 июня 2026', '28 июня 2026',
    '27 июня 2026', '26 июня 2026', '25 июня 2026', '24 июня 2026',
]

def price_label(value):
    if value is None: return '—'
    m = value / 1_000_000
    if m == int(m):
        return f'{int(m)} млн'
    return f'{round(m, 1)} млн'

def photo_bg(category, price_value, idx):
    p = price_value or 0
    warm = 'linear-gradient(145deg,#c4956a 0%,#a07040 35%,#7a5535 65%,#5a3d22 100%)'
    cool = 'linear-gradient(145deg,#4a7fa5 0%,#32607e 40%,#1e3d56 100%)'
    green = 'linear-gradient(145deg,#7a9e7e 0%,#557a58 40%,#3b5c3e 100%)'
    prem = 'linear-gradient(145deg,#2a2535 0%,#1a1628 40%,#0e0c18 100%)'

    if category == 'квартиры':
        if p > 100_000_000: return prem, 'cool'
        if p > 60_000_000:  return warm, 'warm'
        return cool, 'cool'
    if category == 'дома':
        return green, 'green'
    if category == 'дачи':
        return green, 'green'
    if category == 'участки':
        earth = 'linear-gradient(145deg,#b5956a 0%,#8a7050 35%,#6a5535 100%)'
        return earth, 'warm'
    # коммерческая
    gray = 'linear-gradient(145deg,#6a7a8a 0%,#4a5a68 35%,#2e3a48 100%)'
    return gray, 'cool'

def material(building_type):
    bt = (building_type or '').lower()
    if 'новостройка' in bt or 'монолит' in bt: return 'монолит'
    if 'вторичка' in bt: return 'кирпич'
    if 'кирпич' in bt: return 'кирпич'
    if 'панель' in bt: return 'панель'
    return None

def clean_address(addr, district):
    if not addr: return district or ''
    # Remove district name from start if redundant
    addr = re.sub(r'^[А-Яа-я\s]+р-н,\s*', '', addr).strip()
    return addr[:80]

def make_id(db_id):
    return f'#24S-{db_id:04d}'

# ── ЧИТАЕМ БД ────────────────────────────
db = sqlite3.connect(DB_PATH)
db.row_factory = sqlite3.Row
cur = db.cursor()
cols_now = [r[1] for r in db.execute("PRAGMA table_info(listings)")]
cond_col   = 'condition'   if 'condition'   in cols_now else "NULL as condition"
photos_col = 'photos'      if 'photos'      in cols_now else "NULL as photos"
has_seller_col = 'seller_type' in cols_now
seller_col = 'seller_type' if has_seller_col else "NULL as seller_type"
# seller_type != 'owner' (специалист/агентство/застройщик) — не показываем как
# "от хозяина"; пока поле не проверено (seller_type IS NULL — старые записи до
# фикса das[who]=1, ждут прогона --enrich-seller) тоже придерживаем объявление,
# чтобы не показать агентское под видом хозяйского.
seller_filter = "AND seller_type = 'owner'" if has_seller_col else ""
cur.execute(f"""
    SELECT id, deal_type, category, rooms, area, floor, total_floors,
           district, building_type, price_text, price_value, address, url, first_seen,
           {cond_col}, {photos_col}, {seller_col}
    FROM listings
    WHERE district IS NOT NULL
      AND district != ''
      AND district != 'Не указан'
      AND price_value IS NOT NULL
      AND price_value > 0
      {seller_filter}
    ORDER BY id
""")
rows = cur.fetchall()
db.close()

# ── КОНВЕРТИРУЕМ АКТИВНЫЕ ────────────────
active = []
district_counts = {}

for i, row in enumerate(rows):
    dist_name = row['district'] or ''
    dist_id   = DISTRICT_MAP.get(dist_name)
    if not dist_id:
        continue  # пропускаем неизвестные районы

    type_id  = TYPE_MAP.get(row['category'] or '', 'apt')
    mode     = DEAL_MAP.get(row['deal_type'] or '', 'sale')
    bg, scene = photo_bg(row['category'], row['price_value'], i)
    realtor  = REALTORS[i % len(REALTORS)]
    addr     = clean_address(row['address'], dist_name)
    mat      = material(row['building_type'])

    district_counts[dist_id] = district_counts.get(dist_id, 0) + 1

    building = row['building_type'] or ''
    try:
        photos = json.loads(row['photos']) if row['photos'] else []
    except (TypeError, ValueError):
        photos = []

    entry = {
        'id':           make_id(row['id']),
        'district':     dist_id,
        'mode':         mode,
        'type':         type_id,
        'price':        row['price_value'],
        'priceLabel':   price_label(row['price_value']),
        'address':      addr,
        'rooms':        row['rooms'],
        'area':         float(row['area']) if row['area'] else None,
        'material':     mat,
        'condition':    row['condition'] or None,
        'photos':       photos,
        'floor':        row['floor'],
        'floors':       row['total_floors'],
        'buildingType': building,
        'sellerType':   row['seller_type'] or 'owner',
        'status':       'active',
        'ownerPhone':   ARCHIVE_PHONES[i % len(ARCHIVE_PHONES)],
        'claimedBy':    None,
        'photoBg':      bg,
        'scene':        scene,
        'firstSeen':    row['first_seen'],
        'url':          row['url'],
    }
    active.append(entry)

# ── ГЕНЕРИРУЕМ АРХИВ (синтетический) ────
# Берём случайную выборку из активных, меняем mode и добавляем поля архива
random.seed(42)
archive_sample = random.sample(active, min(60, len(active)))
archive = []

for i, base in enumerate(archive_sample):
    a = dict(base)
    a['mode']        = 'archive'
    a['status']      = 'archive'
    a['id']          = a['id'].replace('#24S-', '#24A-')
    a['ownerPhone']  = ARCHIVE_PHONES[i % len(ARCHIVE_PHONES)]
    a['removedDate'] = REMOVED_DATES[i % len(REMOVED_DATES)]
    a['sellerType']  = 'owner'
    a['claimedBy']   = None
    # Каждый 4-й объект уже зафиксирован кем-то
    if i % 4 == 3:
        a['claimedBy'] = ARCHIVE_CLAIMED[i % len(ARCHIVE_CLAIMED)]
    # Архивные фото — приглушённые
    a['photoBg'] = a['photoBg'].replace('#c4956a', '#a8a09a').replace('#4a7fa5', '#8a909a').replace('#7a9e7e', '#8a9890')
    a['scene'] = 'arch-warm' if 'warm' in a['scene'] or 'green' in a['scene'] else 'arch-cool'
    archive.append(a)

all_listings = active + archive

# ── ПОДСЧЁТ АРХИВА ПО РАЙОНАМ ────────────
arch_counts = {}
for a in archive:
    d = a['district']
    arch_counts[d] = arch_counts.get(d, 0) + 1

# ── ОБНОВЛЁННЫЕ DISTRICTS ────────────────
DISTRICT_META = {
    # Ориентация жителя Алматы: Горы=верх(юг) · Восток=ЛЕВО · Запад=ПРАВО · Север=низ
    # Порядок В→З (лево→право): меде → жет/турк → алма(центр) → ауэз/бост → наур → алат
    'mede': {'name': 'Медеуский',     'color': '#2d6be4', 'cx': 38,  'cy': 70,  'r': 18},
    'bost': {'name': 'Бостандыкский', 'color': '#15966b', 'cx': 90,  'cy': 78,  'r': 22},
    'naur': {'name': 'Наурызбайский', 'color': '#dc4446', 'cx': 130, 'cy': 94,  'r': 18},
    'zhet': {'name': 'Жетысуский',    'color': '#7055c0', 'cx': 22,  'cy': 128, 'r': 21},
    'alma': {'name': 'Алмалинский',   'color': '#e07b2a', 'cx': 68,  'cy': 118, 'r': 24},
    'auez': {'name': 'Ауэзовский',    'color': '#c060a0', 'cx': 106, 'cy': 118, 'r': 14},
    'alat': {'name': 'Алатауский',    'color': '#3b7dd8', 'cx': 100, 'cy': 162, 'r': 20},
    'turk': {'name': 'Турксибский',   'color': '#14b89c', 'cx': 42,  'cy': 162, 'r': 15},
}
districts_js = []
for did, meta in DISTRICT_META.items():
    districts_js.append({
        'id':    did,
        'name':  meta['name'],
        'color': meta['color'],
        'cx':    meta['cx'],
        'cy':    meta['cy'],
        'r':     meta['r'],
        'count': district_counts.get(did, 0),
        'arch':  arch_counts.get(did, 0),
    })

# ── ПИШЕМ ФАЙЛ ───────────────────────────
built_at = datetime.now().strftime('%Y-%m-%d %H:%M')
sep = (',', ':')
js = f'''// build_app_data.py — {built_at}
const DISTRICTS={json.dumps(districts_js, ensure_ascii=False, separators=sep)};
const TYPES=[{{"id":"apt","label":"Квартиры"}},{{"id":"house","label":"Дома"}},{{"id":"land","label":"Участки"}},{{"id":"comm","label":"Коммерч."}},{{"id":"dacha","label":"Дачи"}}];
const LISTINGS={json.dumps(all_listings, ensure_ascii=False, separators=sep)};
'''

OUT.write_text(js, encoding='utf-8')
print(f'OK: {len(active)} aktiv + {len(archive)} archive = {len(all_listings)} total')
print(f'   Файл: {OUT}')
print(f'   Районы: { {d: district_counts.get(d, 0) for d in DISTRICT_META} }')
