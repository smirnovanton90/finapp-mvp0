"""Telegram bot handlers."""

import logging
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session
from telegram import Update
from telegram.ext import ContextTypes

from config import settings
from db import SessionLocal
from models import TelegramLinkCode, User
from tg_bot.services.notify import (
    build_notification_text,
    get_planned_transactions_for_notification,
)
from tg_bot.services.yougile import create_task

logger = logging.getLogger(__name__)

# In-memory rate limit for bug reports: user_id -> list of timestamps
_bug_report_timestamps: dict[int, list[datetime]] = defaultdict(list)


def _cleanup_bug_timestamps(user_id: int) -> None:
    """Remove timestamps older than 1 hour."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    _bug_report_timestamps[user_id] = [
        t for t in _bug_report_timestamps[user_id] if t > cutoff
    ]


def _check_bug_rate_limit(user_id: int) -> bool:
    """Return True if user can create a bug report (under 5 per hour)."""
    _cleanup_bug_timestamps(user_id)
    return len(_bug_report_timestamps[user_id]) < 5


def _record_bug_report(user_id: int) -> None:
    _bug_report_timestamps[user_id].append(datetime.now(timezone.utc))


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /start with optional link code."""
    if not update.message or not update.effective_chat:
        return
    chat_id = update.effective_chat.id
    text = (update.message.text or "").strip()
    parts = text.split(maxsplit=1)
    code = parts[1].strip() if len(parts) > 1 else None

    db = SessionLocal()
    try:
        if code and re.match(r"^\d{6}$", code):
            link = (
                db.query(TelegramLinkCode)
                .filter(
                    TelegramLinkCode.code == code,
                    TelegramLinkCode.expires_at > datetime.now(timezone.utc),
                )
                .first()
            )
            if link:
                user = db.query(User).filter(User.id == link.user_id).first()
                if user:
                    user.telegram_chat_id = chat_id
                    if user.telegram_notify_hour is None:
                        user.telegram_notify_hour = 8
                    if user.telegram_notify_minute is None:
                        user.telegram_notify_minute = 0
                    db.delete(link)
                    db.commit()
                    await update.message.reply_text(
                        "Аккаунт привязан. Уведомления о плановых операциях будут приходить в 08:00. "
                        "Изменить время: /time HH:MM. Настройки: /settings"
                    )
                    return
            await update.message.reply_text(
                "Неверный или просроченный код. Получите новый код в личном кабинете приложения."
            )
        else:
            user = db.query(User).filter(User.telegram_chat_id == chat_id).first()
            if user:
                h = user.telegram_notify_hour or 8
                m = user.telegram_notify_minute or 0
                await update.message.reply_text(
                    f"Вы уже привязаны. Уведомления: {h:02d}:{m:02d}. "
                    "Настройки: /settings"
                )
            else:
                await update.message.reply_text(
                    "Чтобы привязать аккаунт, получите код в личном кабинете и отправьте: /start КОД"
                )
    finally:
        db.close()


async def cmd_unlink(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /unlink - unbind Telegram."""
    if not update.message or not update.effective_chat:
        return
    chat_id = update.effective_chat.id

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.telegram_chat_id == chat_id).first()
        if not user:
            await update.message.reply_text("Telegram не привязан.")
            return
        user.telegram_chat_id = None
        user.telegram_notify_hour = None
        user.telegram_notify_minute = None
        db.commit()
        await update.message.reply_text("Аккаунт отвязан. Уведомления отключены.")
    finally:
        db.close()


def _format_notify_time(hour: int, minute: int) -> str:
    return f"{hour:02d}:{minute:02d}"


async def cmd_settings(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /settings - show current settings."""
    if not update.message or not update.effective_chat:
        return
    chat_id = update.effective_chat.id

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.telegram_chat_id == chat_id).first()
        if not user:
            await update.message.reply_text(
                "Сначала привяжите аккаунт: /start КОД (код из личного кабинета)"
            )
            return
        h = user.telegram_notify_hour or 8
        m = user.telegram_notify_minute or 0
        status = "вкл" if user.telegram_notify_enabled else "выкл"
        await update.message.reply_text(
            f"Настройки уведомлений:\n"
            f"• Время: {_format_notify_time(h, m)}\n"
            f"• Уведомления: {status}\n\n"
            f"Изменить время: /time HH:MM (например /time 08:30)\n"
            f"Вкл/выкл: /notify on или /notify off\n"
            f"Отвязать: /unlink"
        )
    finally:
        db.close()


async def cmd_notify(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /notify on|off - enable or disable notifications."""
    if not update.message or not update.effective_chat:
        return
    chat_id = update.effective_chat.id
    text = (update.message.text or "").strip().upper()
    parts = text.split(maxsplit=1)
    enabled = len(parts) > 1 and parts[1] == "ON"

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.telegram_chat_id == chat_id).first()
        if not user:
            await update.message.reply_text(
                "Сначала привяжите аккаунт: /start КОД (код из личного кабинета)"
            )
            return
        user.telegram_notify_enabled = enabled
        db.commit()
        status = "включены" if enabled else "выключены"
        await update.message.reply_text(f"Уведомления {status}.")
    finally:
        db.close()


async def cmd_time(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /time HH:MM - set notification time."""
    if not update.message or not update.effective_chat:
        return
    chat_id = update.effective_chat.id
    text = (update.message.text or "").strip()
    match = re.search(r"/time\s+(\d{1,2}):(\d{2})", text, re.IGNORECASE)
    if not match:
        await update.message.reply_text(
            "Используйте формат: /time HH:MM (например /time 08:30)"
        )
        return
    hour = int(match.group(1))
    minute = int(match.group(2))
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        await update.message.reply_text("Неверный формат времени. Пример: /time 08:30")
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.telegram_chat_id == chat_id).first()
        if not user:
            await update.message.reply_text(
                "Сначала привяжите аккаунт: /start КОД (код из личного кабинета)"
            )
            return
        user.telegram_notify_hour = hour
        user.telegram_notify_minute = minute
        db.commit()
        await update.message.reply_text(
            f"Время уведомлений установлено: {_format_notify_time(hour, minute)}"
        )
    finally:
        db.close()


async def cmd_bug(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /bug <text> - create YouGile ticket."""
    if not update.message or not update.effective_chat:
        return
    chat_id = update.effective_chat.id
    text = (update.message.text or "").strip()
    bug_text = text[4:].strip() if text.upper().startswith("/BUG") else ""

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.telegram_chat_id == chat_id).first()
        if not user:
            await update.message.reply_text(
                "Сначала привяжите аккаунт: /start КОД (код из личного кабинета)"
            )
            return

        if not bug_text:
            await update.message.reply_text(
                "Опишите ошибку: /bug Ваше описание проблемы"
            )
            return

        if not _check_bug_rate_limit(user.id):
            await update.message.reply_text(
                "Превышен лимит: не более 5 отчётов в час. Попробуйте позже."
            )
            return

        title = f"Ошибка от пользователя: {bug_text[:50]}{'...' if len(bug_text) > 50 else ''}"
        meta = (
            f"\n\n---\nUser ID: {user.id}\n"
            f"Telegram chat_id: {chat_id}\n"
            f"Время: {datetime.now(timezone.utc).isoformat()}"
        )
        description = bug_text + meta

        result = create_task(title=title, description=description)
        _record_bug_report(user.id)

        if result:
            task_id = result.get("id", "?")
            await update.message.reply_text(f"Тикет создан #{task_id}")
        else:
            await update.message.reply_text(
                "Не удалось создать тикет. Попробуйте позже или сообщите в поддержку."
            )
    finally:
        db.close()
