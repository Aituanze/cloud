# -*- coding: utf-8 -*-
"""
Еженедельный отчёт 24streets.
Собирает статистику лидов и новых объектов за последние 7 дней, отправляет в Telegram.

Запуск: python reporter.py
Добавить в cron: 0 9 * * 1 python /path/to/reporter.py  (каждый понедельник в 9:00)
"""

import os
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN", "")
TELEGRAM_GROUP_ID = os.getenv("TELEGRAM_GROUP_ID", "")
LEADS_DB = HERE / "realty-lead-bot" / "leads.db"
LISTINGS_DB = HERE / "krisha-parser" / "listings.db"


def _send(text: str) -> None:
    if TELEGRAM_TOKEN and TELEGRAM_GROUP_ID:
        try:
            requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                json={"chat_id": TELEGRAM_GROUP_ID, "text": text},
                timeout=10,
            )
        except Exception as exc:
            print(f"Ошибка отправки Telegram: {exc}")


def _leads_stats(since: str) -> dict:
    if not LEADS_DB.exists():
        return {"total": 0, "new": 0, "in_work": 0}
    with sqlite3.connect(str(LEADS_DB)) as conn:
        total = conn.execute(
            "SELECT COUNT(*) FROM leads WHERE created_at >= ?", (since,)
        ).fetchone()[0]
        new = conn.execute(
            "SELECT COUNT(*) FROM leads WHERE created_at >= ? AND status = 'Новый'", (since,)
        ).fetchone()[0]
        in_work = conn.execute(
            "SELECT COUNT(*) FROM leads WHERE created_at >= ? AND status LIKE 'В работе%'", (since,)
        ).fetchone()[0]
    return {"total": total, "new": new, "in_work": in_work}


def _listings_stats(since: str) -> list[tuple[str, int]]:
    if not LISTINGS_DB.exists():
        return []
    with sqlite3.connect(str(LISTINGS_DB)) as conn:
        return conn.execute(
            "SELECT district, COUNT(*) as cnt FROM listings "
            "WHERE first_seen >= ? GROUP BY district ORDER BY cnt DESC LIMIT 8",
            (since,),
        ).fetchall()


def main() -> None:
    week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")
    today = datetime.now().strftime("%Y-%m-%d")

    leads = _leads_stats(week_ago)
    listings = _listings_stats(week_ago)

    lines = [
        f"📊 Еженедельный отчёт 24streets",
        f"Неделя до {today}",
        "",
        "👥 Лиды за 7 дней:",
        f"  Всего:     {leads['total']}",
        f"  Новых:     {leads['new']}",
        f"  В работе:  {leads['in_work']}",
        "",
        "🏠 Новых объектов по районам:",
    ]
    if listings:
        for district, count in listings:
            lines.append(f"  {district}: +{count}")
    else:
        lines.append("  Нет данных (база не найдена или пуста)")

    text = "\n".join(lines)
    print(text)
    _send(text)


if __name__ == "__main__":
    main()
