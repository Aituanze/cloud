# -*- coding: utf-8 -*-
"""
Мастер-скрипт 24streets.
Цепочка: парсер krisha.kz → обновление каталога → обновление quick-match → Telegram-уведомление.

Запуск:
  python pipeline.py          # однократный прогон
  python pipeline.py --cron   # по расписанию каждые 6 часов (требует: pip install apscheduler)
"""

import logging
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN", "")
TELEGRAM_GROUP_ID = os.getenv("TELEGRAM_GROUP_ID", "")

HERE = Path(__file__).resolve().parent

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

SCRIPTS = [
    HERE / "krisha-parser" / "krisha_parser.py",
    HERE / "realty-catalog" / "build_data.py",
    HERE / "realty-quick-match" / "build_data.py",
    HERE.parent.parent / "24streets-app" / "data" / "build_app_data.py",
]


def _send_telegram(text: str) -> None:
    if not TELEGRAM_TOKEN or not TELEGRAM_GROUP_ID:
        log.warning("TELEGRAM_TOKEN или TELEGRAM_GROUP_ID не заданы — уведомление пропущено")
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            json={"chat_id": TELEGRAM_GROUP_ID, "text": text},
            timeout=10,
        )
    except Exception as exc:
        log.error("Ошибка отправки Telegram: %s", exc)


def _run_script(script: Path) -> tuple[bool, str]:
    log.info("▶ %s", script.name)
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    result = subprocess.run(
        [sys.executable, str(script)],
        capture_output=True,
        env=env,
    )
    stdout = (result.stdout or b"").decode("utf-8", errors="replace")
    stderr = (result.stderr or b"").decode("utf-8", errors="replace")
    output = (stdout + stderr).strip()
    last_line = output.splitlines()[-1] if output else ""
    if result.returncode != 0:
        log.error("✗ %s\n%s", script.name, output[-500:])
        return False, last_line
    log.info("✓ %s: %s", script.name, last_line)
    return True, last_line


def run_pipeline() -> None:
    started = datetime.now().strftime("%Y-%m-%d %H:%M")
    log.info("=== Pipeline запущен %s ===", started)

    results = []
    for script in SCRIPTS:
        ok, last_line = _run_script(script)
        results.append((script.name, ok, last_line))

    ok_count = sum(1 for _, ok, _ in results if ok)
    lines = [f"🏠 24streets pipeline — {started}", f"Скриптов выполнено: {ok_count}/{len(results)}", ""]
    for name, ok, last_line in results:
        icon = "✅" if ok else "❌"
        lines.append(f"{icon} {name}: {last_line}")

    _send_telegram("\n".join(lines))
    log.info("=== Pipeline завершён ===")


def main() -> None:
    if "--cron" in sys.argv:
        try:
            from apscheduler.schedulers.blocking import BlockingScheduler
        except ImportError:
            log.error("apscheduler не установлен: pip install apscheduler")
            sys.exit(1)

        run_pipeline()  # немедленный запуск при старте
        scheduler = BlockingScheduler(timezone="Asia/Almaty")
        scheduler.add_job(run_pipeline, "interval", hours=6)
        log.info("Планировщик активен — запуск каждые 6 часов. Ctrl+C для остановки.")
        try:
            scheduler.start()
        except KeyboardInterrupt:
            log.info("Остановлен.")
    else:
        run_pipeline()


if __name__ == "__main__":
    main()
