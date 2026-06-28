# -*- coding: utf-8 -*-
"""
Генератор данных для каталога.

Читает базу парсера (../krisha-parser/listings.db) и формирует файл
data/listings.js вида:

    window.LISTINGS = [ {...}, {...} ];
    window.LISTINGS_BUILT_AT = "2026-06-27 15:00";

Запуск:
    python build_data.py
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB_PATH = HERE.parent / "krisha-parser" / "listings.db"
OUT_PATH = HERE / "data" / "listings.js"


def main() -> None:
    if not DB_PATH.exists():
        raise SystemExit(
            f"Не найдена база парсера: {DB_PATH}\n"
            f"Сначала запустите парсер в ../krisha-parser (python krisha_parser.py)."
        )

    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        rows = [dict(r) for r in conn.execute("SELECT * FROM listings ORDER BY id")]

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    built_at = datetime.now().strftime("%Y-%m-%d %H:%M")
    payload = json.dumps(rows, ensure_ascii=False, indent=2)
    OUT_PATH.write_text(
        "// Файл сгенерирован build_data.py из ../krisha-parser/listings.db\n"
        "// Не редактируйте вручную — перезапустите генератор.\n"
        f"window.LISTINGS = {payload};\n"
        f'window.LISTINGS_BUILT_AT = "{built_at}";\n',
        encoding="utf-8",
    )
    print(f"Готово: {len(rows)} объявлений → {OUT_PATH}")


if __name__ == "__main__":
    main()
