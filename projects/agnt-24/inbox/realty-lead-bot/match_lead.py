# -*- coding: utf-8 -*-
"""Подбирает объекты из listings.db под запрос лида."""

import logging
import re
import sqlite3
from pathlib import Path
from typing import Optional

import config

log = logging.getLogger(__name__)

# Ключевые слова для извлечения района из текста лида
_DISTRICTS = {
    "алатауск": "Алатауский",
    "алмалинск": "Алмалинский",
    "ауэзовск": "Ауэзовский",
    "бостандык": "Бостандыкский",
    "жетысуск": "Жетысуский",
    "медеуск": "Медеуский",
    "наурызбайск": "Наурызбайский",
    "турксибск": "Турксибский",
}

_CATEGORIES = {
    "квартир": "квартиры",
    "дом": "дома",
    "участ": "участки",
    "коммерч": "коммерческая",
    "дач": "дачи",
}


def _district(text: str) -> Optional[str]:
    t = text.lower()
    for kw, district in _DISTRICTS.items():
        if kw in t:
            return district
    return None


def _rooms(text: str) -> Optional[int]:
    if re.search(r"студи", text, re.IGNORECASE):
        return 0
    m = re.search(r"(\d+)\s*[-–]?\s*комнат", text, re.IGNORECASE)
    return int(m.group(1)) if m else None


def _category(text: str) -> Optional[str]:
    t = text.lower()
    for kw, cat in _CATEGORIES.items():
        if kw in t:
            return cat
    return None


def _prices(text: str) -> tuple[Optional[int], Optional[int]]:
    """Возвращает (price_min, price_max) в тенге. Понимает «млн» и «тыс»."""
    nums_mln = re.findall(r"(\d+(?:[.,]\d+)?)\s*млн", text, re.IGNORECASE)
    values = [int(float(v.replace(",", ".")) * 1_000_000) for v in nums_mln]
    t = text.lower()
    if "от" in t and values:
        return values[0], None
    if "до" in t and values:
        return None, values[-1]
    if len(values) >= 2:
        return min(values), max(values)
    if len(values) == 1:
        return None, values[0]
    return None, None


def find_matches(request_text: str, db_path: str = None, limit: int = 5) -> list[dict]:
    """Возвращает список объектов из listings.db, подходящих под текст лида."""
    if db_path is None:
        db_path = config.LISTINGS_DB_PATH
    if not Path(db_path).exists():
        log.warning("База объектов не найдена: %s", db_path)
        return []

    district = _district(request_text)
    rooms = _rooms(request_text)
    category = _category(request_text)
    price_min, price_max = _prices(request_text)

    # По умолчанию ищем только продажу; при наличии слова «аренда» — аренду
    deal = "аренда" if re.search(r"арен|снять|сниму", request_text, re.IGNORECASE) else "продажа"

    conditions = ["deal_type = ?"]
    params: list = [deal]

    if district:
        conditions.append("district = ?")
        params.append(district)
    if rooms is not None:
        conditions.append("rooms = ?")
        params.append(rooms)
    if category:
        conditions.append("category = ?")
        params.append(category)
    if price_min is not None:
        conditions.append("price_value >= ?")
        params.append(price_min)
    if price_max is not None:
        conditions.append("price_value <= ?")
        params.append(price_max)

    sql = (
        "SELECT * FROM listings WHERE "
        + " AND ".join(conditions)
        + " ORDER BY first_seen DESC LIMIT ?"
    )
    params.append(limit)

    try:
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            return [dict(r) for r in conn.execute(sql, params).fetchall()]
    except Exception as exc:
        log.error("Ошибка запроса listings.db: %s", exc)
        return []


def format_matches(matches: list[dict], lead_id: int) -> str:
    """Форматирует подборку для отправки в Telegram."""
    if not matches:
        return f"🔍 Лид #{lead_id}: подходящих объектов в базе не найдено"
    lines = [f"🔍 Подборка под лид #{lead_id} ({len(matches)} шт.):"]
    for i, m in enumerate(matches, 1):
        title = (m.get("title") or "—")[:55]
        price = m.get("price_text") or "—"
        url = m.get("url") or ""
        lines.append(f"\n{i}. {title}\n   💰 {price}\n   🔗 {url}")
    return "\n".join(lines)
