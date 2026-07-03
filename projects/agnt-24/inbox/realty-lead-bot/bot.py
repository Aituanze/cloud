# -*- coding: utf-8 -*-
"""
Telegram-бот для сбора лидов по недвижимости (Алматы).

Клиент описывает, что ищет → лид сохраняется в базу (SQLite, опц. Google Sheets)
→ в группу риэлторов приходит уведомление с кнопкой «Беру».

Стек: python-telegram-bot v21+ (асинхронный API).
"""

import logging
import re

import match_lead
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    Update,
)
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

import config
from storage import Lead, LeadStorage, now_str

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

storage = LeadStorage()

# Простое извлечение телефона из текста (KZ/RU форматы)
PHONE_RE = re.compile(r"(\+?7|8)[\s\-(]*\d{3}[\s\-)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}")


def extract_phone(text: str) -> str:
    match = PHONE_RE.search(text or "")
    return match.group(0).strip() if match else ""


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    contact_kb = ReplyKeyboardMarkup(
        [[KeyboardButton("📱 Отправить мой номер", request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )
    await update.message.reply_text(
        "🏠 Здравствуйте! Я помогу подобрать недвижимость.\n\n"
        "Опишите, что ищете, например:\n"
        "«3-комнатная квартира в Бостандыкском районе до 60 млн, "
        "телефон +7 777 123 45 67».\n\n"
        "Можно сразу отправить свой номер кнопкой ниже 👇",
        reply_markup=contact_kb,
    )


async def handle_contact(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Пользователь поделился контактом — сохраняем номер в context для следующего сообщения."""
    contact = update.message.contact
    context.user_data["phone"] = contact.phone_number
    await update.message.reply_text(
        "✅ Номер сохранён. Теперь напишите, какую недвижимость ищете."
    )


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.message.from_user
    text = update.message.text or ""

    phone = extract_phone(text) or context.user_data.get("phone", "")

    lead = Lead(
        created_at=now_str(),
        user_id=user.id,
        first_name=user.first_name or "",
        last_name=user.last_name or "",
        username=user.username or "",
        phone=phone,
        request=text,
    )

    try:
        lead_id = storage.save(lead)
    except Exception as exc:  # noqa: BLE001
        logger.error("Ошибка сохранения лида: %s", exc)
        await update.message.reply_text(
            "⚠️ Произошла ошибка при сохранении. Попробуйте позже."
        )
        return

    await update.message.reply_text(
        "✅ Заявка принята! Риэлтор свяжется с вами в ближайшее время."
    )

    await notify_group(context, lead, lead_id)
    await send_matches(context, lead_id, lead.request)


async def send_matches(
    context: ContextTypes.DEFAULT_TYPE, lead_id: int, request: str
) -> None:
    """Отправляет в группу агентов подборку объектов под запрос лида."""
    if not config.TELEGRAM_GROUP_ID:
        return
    try:
        matches = match_lead.find_matches(request)
        text = match_lead.format_matches(matches, lead_id)
        await context.bot.send_message(chat_id=config.TELEGRAM_GROUP_ID, text=text)
    except Exception as exc:  # noqa: BLE001
        logger.error("Ошибка матчинга лида #%s: %s", lead_id, exc)


async def notify_group(
    context: ContextTypes.DEFAULT_TYPE, lead: Lead, lead_id: int
) -> None:
    if not config.TELEGRAM_GROUP_ID:
        logger.warning("TELEGRAM_GROUP_ID не задан — уведомление в группу не отправлено")
        return

    username = f"@{lead.username}" if lead.username else "—"
    text = (
        f"🔥 Новый лид #{lead_id}\n"
        f"Имя: {lead.first_name} {lead.last_name}".strip() + "\n"
        f"Username: {username}\n"
        f"Телефон: {lead.phone or 'не указан'}\n"
        f"Запрос: {lead.request}"
    )
    keyboard = InlineKeyboardMarkup(
        [[InlineKeyboardButton("✅ Беру в работу", callback_data=f"take:{lead_id}")]]
    )
    try:
        await context.bot.send_message(
            chat_id=config.TELEGRAM_GROUP_ID, text=text, reply_markup=keyboard
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("Не удалось отправить уведомление в группу: %s", exc)


async def on_take(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    lead_id = int(query.data.split(":", 1)[1])
    realtor = query.from_user

    realtor_name = f"@{realtor.username}" if realtor.username else realtor.first_name
    storage.update_status(lead_id, f"В работе: {realtor_name}")

    await query.edit_message_text(
        f"{query.message.text}\n\n👤 Взял в работу: {realtor_name}"
    )


async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error("Необработанная ошибка: %s", context.error)


def main() -> None:
    if not config.TELEGRAM_TOKEN:
        logger.error("TELEGRAM_TOKEN не задан. Заполните файл .env (см. .env.example).")
        return

    app = Application.builder().token(config.TELEGRAM_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.CONTACT, handle_contact))
    app.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message)
    )
    app.add_handler(CallbackQueryHandler(on_take, pattern=r"^take:\d+$"))
    app.add_error_handler(error_handler)

    logger.info("Бот запущен и ожидает сообщения...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
