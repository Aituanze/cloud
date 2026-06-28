# -*- coding: utf-8 -*-
"""Хранилище лидов: SQLite по умолчанию + опциональная синхронизация с Google Sheets."""

import logging
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

import config

logger = logging.getLogger(__name__)


@dataclass
class Lead:
    created_at: str
    user_id: int
    first_name: str
    last_name: str
    username: str
    phone: str
    request: str
    status: str = "Новый"


class LeadStorage:
    """Сохраняет лиды в SQLite и (опционально) в Google Sheets."""

    def __init__(self) -> None:
        self._db_path = config.DB_PATH
        self._sheet = None
        self._init_db()
        if config.USE_GOOGLE_SHEETS:
            self._init_google_sheet()

    # --- SQLite ---
    def _init_db(self) -> None:
        Path(self._db_path).parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self._db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS leads (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at  TEXT NOT NULL,
                    user_id     INTEGER NOT NULL,
                    first_name  TEXT,
                    last_name   TEXT,
                    username    TEXT,
                    phone       TEXT,
                    request     TEXT NOT NULL,
                    status      TEXT NOT NULL DEFAULT 'Новый'
                )
                """
            )
        logger.info("База SQLite готова: %s", self._db_path)

    # --- Google Sheets (опционально) ---
    def _init_google_sheet(self) -> None:
        try:
            import gspread
            from google.oauth2.service_account import Credentials

            scopes = [
                "https://www.googleapis.com/auth/spreadsheets",
                "https://www.googleapis.com/auth/drive",
            ]
            creds = Credentials.from_service_account_file(
                config.GOOGLE_CREDENTIALS_FILE, scopes=scopes
            )
            client = gspread.authorize(creds)
            self._sheet = client.open(config.GOOGLE_SHEET_NAME).sheet1
            logger.info("Подключение к Google Sheets успешно")
        except Exception as exc:  # noqa: BLE001
            logger.error("Не удалось подключиться к Google Sheets: %s", exc)
            self._sheet = None

    def save(self, lead: Lead) -> int:
        """Сохраняет лид и возвращает его ID в базе."""
        with sqlite3.connect(self._db_path) as conn:
            cursor = conn.execute(
                """
                INSERT INTO leads
                    (created_at, user_id, first_name, last_name, username, phone, request, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    lead.created_at,
                    lead.user_id,
                    lead.first_name,
                    lead.last_name,
                    lead.username,
                    lead.phone,
                    lead.request,
                    lead.status,
                ),
            )
            lead_id = cursor.lastrowid

        if self._sheet is not None:
            try:
                self._sheet.append_row(
                    [
                        lead_id,
                        lead.created_at,
                        lead.user_id,
                        lead.first_name,
                        lead.last_name,
                        lead.username,
                        lead.phone,
                        lead.request,
                        lead.status,
                    ]
                )
            except Exception as exc:  # noqa: BLE001
                logger.error("Ошибка записи в Google Sheets: %s", exc)

        return lead_id

    def update_status(self, lead_id: int, status: str) -> bool:
        with sqlite3.connect(self._db_path) as conn:
            cursor = conn.execute(
                "UPDATE leads SET status = ? WHERE id = ?", (status, lead_id)
            )
            return cursor.rowcount > 0


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
