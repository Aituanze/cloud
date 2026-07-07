"""Разовый прогон: догрузить condition/photos/year_built для ВСЕХ owner-объявлений,
у которых photos ещё NULL (2026-07-07). enrich_details() в krisha_parser.py делает
то же самое, но без фильтра по seller_type — тут сузили до owner, т.к. только
owner-строки вообще попадают в listings.js (build_app_data.py WHERE seller_type='owner'),
остальное — трата времени на объявления, которых пользователь никогда не увидит.

Идемпотентно (WHERE photos IS NULL) — безопасно перезапускать после обрыва.
"""
import sys, io, sqlite3, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

from krisha_parser import fetch_with_status, parse_condition, parse_photos, parse_year, DB_PATH, REQUEST_DELAY_SEC
import json

with sqlite3.connect(DB_PATH) as conn:
    rows = conn.execute(
        "SELECT id, url FROM listings WHERE photos IS NULL AND seller_type='owner' AND url IS NOT NULL"
    ).fetchall()

print(f"К обработке: {len(rows)}")
processed = updated_cond = updated_photos = updated_year = gone = blocks = 0

for row_id, url in rows:
    html, status = fetch_with_status(url)
    if status == 404:
        gone += 1
        processed += 1
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("UPDATE listings SET condition = ?, photos = ? WHERE id = ?", ("", "[]", row_id))
        time.sleep(REQUEST_DELAY_SEC)
        continue
    if not html:
        blocks += 1
        if blocks >= 3:
            print("Похоже на блокировку — останавливаюсь досрочно.")
            break
        continue
    blocks = 0
    cond = parse_condition(html)
    photos = parse_photos(html)
    year = parse_year(html)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "UPDATE listings SET condition = ?, photos = ?, year_built = ? WHERE id = ?",
            (cond or "", json.dumps(photos, ensure_ascii=False), year, row_id),
        )
    processed += 1
    if cond: updated_cond += 1
    if photos: updated_photos += 1
    if year: updated_year += 1
    if processed % 50 == 0:
        print(f"Обработано {processed}/{len(rows)} — фото {updated_photos}, состояние {updated_cond}, год {updated_year}, gone {gone}")
    time.sleep(REQUEST_DELAY_SEC)

print(f"ГОТОВО. Обработано {processed}, фото у {updated_photos}, состояние у {updated_cond}, год у {updated_year}, gone {gone}")
