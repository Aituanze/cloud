"""Разовый прогон: заполнить seller_type только для Талгарского района
(новые объявления по 5 добавленным посёлкам, 2026-07-07). Не трогает
остальные районы — та задолженность существовала и до этой задачи,
не в её объёме.

build_app_data.py требует seller_type='owner', иначе строка придерживается
(см. комментарий в самом build_app_data.py) — без этого прогона свежесобранные
Талгарские объявления не попадут в listings.js вообще.
"""
import sys, io, sqlite3, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

from krisha_parser import fetch_with_status, parse_seller, DB_PATH, REQUEST_DELAY_SEC

with sqlite3.connect(DB_PATH) as conn:
    rows = conn.execute(
        "SELECT id, url FROM listings WHERE seller_type IS NULL AND district='Талгарский' AND url IS NOT NULL"
    ).fetchall()

print(f"К обработке: {len(rows)}")
processed = owners = agencies = gone = blocks = 0

for row_id, url in rows:
    html, status = fetch_with_status(url)
    if status == 404:
        gone += 1
        processed += 1
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("UPDATE listings SET seller_type = ? WHERE id = ?", ("gone", row_id))
        time.sleep(REQUEST_DELAY_SEC)
        continue
    if not html:
        blocks += 1
        if blocks >= 3:
            print("Похоже на блокировку — останавливаюсь досрочно.")
            break
        continue
    blocks = 0
    seller_type, agency_name = parse_seller(html)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "UPDATE listings SET seller_type = ?, seller_agency = ? WHERE id = ?",
            (seller_type or "unknown", agency_name, row_id),
        )
    processed += 1
    if seller_type == "owner":
        owners += 1
    elif seller_type:
        agencies += 1
    if processed % 50 == 0:
        print(f"Обработано {processed}/{len(rows)} — владельцы {owners}, агентские {agencies}, gone {gone}")
    time.sleep(REQUEST_DELAY_SEC)

print(f"ГОТОВО. Обработано {processed}, владельцы {owners}, агентские {agencies}, gone {gone}")
