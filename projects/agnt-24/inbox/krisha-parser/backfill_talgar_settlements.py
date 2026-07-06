"""Разовый бэкфилл: пересчитать microdistrict для существующих строк
Талгарского района под новый список из 6 посёлков (владелец сузил список
2026-07-07). Старые записи с посёлками не из нового списка (Кендала/Актас/
Алмалык/Панфилово/Отеген батыр) становятся microdistrict=NULL — это верно,
владелец явно попросил оставить только шесть.
"""
import sys, io, sqlite3
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from krisha_parser import parse_microdistrict, DB_PATH

with sqlite3.connect(DB_PATH) as conn:
    rows = conn.execute(
        "SELECT id, address, microdistrict FROM listings WHERE district='Талгарский'"
    ).fetchall()
    changed = 0
    for row_id, address, old_micro in rows:
        new_micro = parse_microdistrict(address or "", "Талгарский")
        if new_micro != old_micro:
            conn.execute("UPDATE listings SET microdistrict=? WHERE id=?", (new_micro, row_id))
            changed += 1
    conn.commit()

print(f"Всего строк Талгарского района: {len(rows)}")
print(f"Изменено microdistrict: {changed}")

with sqlite3.connect(DB_PATH) as conn:
    cur = conn.execute(
        "SELECT COALESCE(microdistrict,'—'), COUNT(*) FROM listings "
        "WHERE district='Талгарский' GROUP BY microdistrict ORDER BY COUNT(*) DESC"
    )
    for r in cur.fetchall():
        print(r)
