# -*- coding: utf-8 -*-
"""Разовое обогащение seller_type для новых Талгарских объявлений — иначе
build_app_data.py (WHERE seller_type='owner') не покажет ни одного из них.
Точечно только district='Талгарский', а не весь бэклог NULL seller_type
(остальное — отдельная плановая enrich_seller_type() задача, см. BACKLOG).
"""
import logging
import sqlite3
import time

import krisha_parser as kp

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.FileHandler("talgar_seller_backfill.log", encoding="utf-8"), logging.StreamHandler()],
)
logger = logging.getLogger("backfill_talgar_seller")


def main():
    kp.init_db()
    with sqlite3.connect(kp.DB_PATH) as conn:
        rows = conn.execute(
            "SELECT id, url FROM listings WHERE district='Талгарский' AND seller_type IS NULL AND url IS NOT NULL"
        ).fetchall()

    total = len(rows)
    logger.info("К проверке: %s Талгарских объявлений без seller_type", total)

    processed = 0
    owners = 0
    gone = 0
    blocks = 0
    for i, (row_id, url) in enumerate(rows, 1):
        html, status = kp.fetch_with_status(url)
        if status == 404:
            gone += 1
            processed += 1
            with sqlite3.connect(kp.DB_PATH) as conn:
                conn.execute("UPDATE listings SET seller_type = ? WHERE id = ?", ("gone", row_id))
            time.sleep(kp.REQUEST_DELAY_SEC)
            continue
        if not html:
            blocks += 1
            logger.warning("Пустой ответ для id=%s (%s подряд)", row_id, blocks)
            if blocks >= 3:
                logger.warning("Похоже на блокировку — останавливаюсь досрочно на %s/%s.", i, total)
                break
            time.sleep(kp.REQUEST_DELAY_SEC)
            continue
        blocks = 0
        seller_type, agency_name = kp.parse_seller(html)
        with sqlite3.connect(kp.DB_PATH) as conn:
            conn.execute(
                "UPDATE listings SET seller_type = ?, seller_agency = ? WHERE id = ?",
                (seller_type or "unknown", agency_name, row_id),
            )
        processed += 1
        if seller_type == "owner":
            owners += 1
        if i % 50 == 0:
            logger.info("Прогресс: %s/%s (хозяев %s, снято %s)", i, total, owners, gone)
        time.sleep(kp.REQUEST_DELAY_SEC)

    logger.info("Готово. Проверено %s, хозяев найдено %s, снято с публикации %s.", processed, owners, gone)


if __name__ == "__main__":
    main()
