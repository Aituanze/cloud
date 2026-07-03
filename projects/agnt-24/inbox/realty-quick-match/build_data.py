#!/usr/bin/env python3
# Генерирует data/listings.js из базы krisha-parser. Запуск:
#   python build_data.py [path/to/listings.db]
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
DB = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "krisha-parser", "listings.db")
OUT = os.path.join(HERE, "data", "listings.js")

# Центры районов (совпадают с data/districts.js) — fallback для координат
DISTRICT_CENTER = {
    "Бостандыкский": (76.906, 43.234), "Алмалинский": (76.930, 43.255),
    "Медеуский": (76.965, 43.245), "Ауэзовский": (76.860, 43.230),
    "Жетысуйский": (76.905, 43.290), "Алатауский": (76.880, 43.310),
    "Талгарский": (77.230, 43.300),
}

DISTRICT_FIXES = {
    "Алматауский": "Алатауский",   # убрана лишняя «м»
    "Жетысуский": "Жетысуйский",   # написание парсера → написание приложения
}

def fix_district(name):
    name = (name or "").strip()
    return DISTRICT_FIXES.get(name, name)

def main():
    if not os.path.exists(DB):
        print("База не найдена:", DB); sys.exit(1)
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    # ВНИМАНИЕ: имена таблицы/колонок сверить с krisha_parser.py (Step 1)
    rows = con.execute("SELECT * FROM listings").fetchall()
    con.close()

    seen, items, now = set(), [], datetime.now(timezone.utc).isoformat()
    for r in rows:
        d = dict(r)
        url = d.get("url")
        if not url or url in seen:
            continue
        seen.add(url)
        district = fix_district(d.get("district"))
        cx, cy = DISTRICT_CENTER.get(district, (76.92, 43.26))
        items.append({
            "id": d.get("id"),
            "category": d.get("category"),
            "deal_type": d.get("deal_type"),
            "rooms": d.get("rooms"),
            "area": d.get("area"),
            "floor": d.get("floor"),
            "total_floors": d.get("total_floors"),
            "district": district,
            "building_type": d.get("building_type"),
            "title": d.get("title"),
            "price_text": d.get("price_text"),
            "price_value": d.get("price_value"),
            "address": d.get("address"),
            "url": url,
            "lat": d.get("lat") if d.get("lat") is not None else cy,
            "lng": d.get("lng") if d.get("lng") is not None else cx,
            "video": d.get("video") or "",
            "photos": [d.get("photo")] if d.get("photo") else [],
            "agentId": d.get("agent_id") or "a1",
            "first_seen": d.get("first_seen") or now,
        })

    body = json.dumps(items, ensure_ascii=False, indent=2)
    js = (
        "// Файл сгенерирован build_data.py из базы krisha-parser. Не редактировать вручную.\n"
        "(function (root) {\n"
        "  var LISTINGS = " + body + ";\n"
        "  if (typeof module !== \"undefined\" && module.exports) module.exports = LISTINGS;\n"
        "  root.LISTINGS = LISTINGS;\n"
        "})(typeof self !== \"undefined\" ? self : this);\n"
    )
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(js)
    print("Готово:", OUT, "| объектов:", len(items))

if __name__ == "__main__":
    main()
