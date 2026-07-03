# -*- coding: utf-8 -*-
"""Настройки проекта. Значения читаются из переменных окружения (.env)."""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

# Загружаем переменные из файла .env (если он есть)
load_dotenv(BASE_DIR / ".env")

# --- Telegram ---
# Токен бота, который вы получили у @BotFather
TELEGRAM_TOKEN: str = os.getenv("TELEGRAM_TOKEN", "").strip()

# ID группы/чата риэлторов для уведомлений о новых лидах.
# Например: -1001234567890 (узнать можно через @getidsbot)
TELEGRAM_GROUP_ID: str = os.getenv("TELEGRAM_GROUP_ID", "").strip()

# --- Хранилище ---
# Путь к локальной базе SQLite (создаётся автоматически)
DB_PATH: str = os.getenv("DB_PATH", str(BASE_DIR / "leads.db"))

# Путь к базе объектов krisha-parser для матчинга лидов
LISTINGS_DB_PATH: str = os.getenv(
    "LISTINGS_DB_PATH",
    str(BASE_DIR.parent / "krisha-parser" / "listings.db"),
)

# --- Google Sheets (опционально) ---
# Включить дублирование лидов в Google Таблицу: true / false
USE_GOOGLE_SHEETS: bool = os.getenv("USE_GOOGLE_SHEETS", "false").lower() == "true"
GOOGLE_SHEET_NAME: str = os.getenv("GOOGLE_SHEET_NAME", "Лидогенератор").strip()
GOOGLE_CREDENTIALS_FILE: str = os.getenv(
    "GOOGLE_CREDENTIALS_FILE", str(BASE_DIR / "credentials.json")
)
