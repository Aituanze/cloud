# -*- coding: utf-8 -*-
"""Разовый бэкфилл year_built для уже собранных объявлений от хозяев
(seller_type='owner') — единственная категория, которая реально показывается
в приложении. Отдельный скрипт вместо enrich_year_built() из krisha_parser.py,
чтобы не тратить часы на агентские/агентства/комплексы объявления, которые
build_app_data.py всё равно отфильтровывает.

Запускать вручную, один раз (или когда появляется много новых owner-строк
без year_built). Логирует прогресс в year_backfill.log.
"""
import logging
import sqlite3
import sys
import time

import krisha_parser as kp

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.FileHandler("year_backfill.log", encoding="utf-8"), logging.StreamHandler()],
)
logger = logging.getLogger("backfill_year")


def main():
    kp.init_db()
    with sqlite3.connect(kp.DB_PATH) as conn:
        rows = conn.execute(
            "SELECT id, url FROM listings WHERE seller_type='owner' AND year_built IS NULL AND url IS NOT NULL"
        ).fetchall()

    total = len(rows)
    logger.info("К проверке: %s объявлений от хозяев без year_built", total)

    processed = 0
    found = 0
    gone = 0
    blocks = 0
    for i, (row_id, url) in enumerate(rows, 1):
        html, status = kp.fetch_with_status(url)
        if status == 404:
            gone += 1
            processed += 1
            with sqlite3.connect(kp.DB_PATH) as conn:
                conn.execute("UPDATE listings SET year_built = -1 WHERE id = ?", (row_id,))
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
        year = kp.parse_year(html)
        with sqlite3.connect(kp.DB_PATH) as conn:
            conn.execute("UPDATE listings SET year_built = ? WHERE id = ?", (year if year else -1, row_id))
        processed += 1
        if year:
            found += 1
        if i % 50 == 0:
            logger.info("Прогресс: %s/%s (найден год у %s, снято %s)", i, total, found, gone)
        time.sleep(kp.REQUEST_DELAY_SEC)

    logger.info("Готово. Проверено %s, год найден у %s, снято с публикации %s.", processed, found, gone)


if __name__ == "__main__":
    main()
