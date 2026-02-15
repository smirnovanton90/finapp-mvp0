"""APScheduler job for sending planned transaction notifications."""

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from db import SessionLocal
from models import User
from tg_bot.bot import get_bot
from tg_bot.services.notify import (
    build_notification_text,
    get_planned_transactions_for_notification,
)

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None
_default_tz = "Europe/Moscow"


def _get_users_to_notify(db, now: datetime) -> list[User]:
    """Get users who should receive notification at this time."""
    hour = now.hour
    minute = now.minute
    return (
        db.query(User)
        .filter(
            User.telegram_chat_id.isnot(None),
            User.telegram_notify_enabled == True,
            User.telegram_notify_hour == hour,
            User.telegram_notify_minute == minute,
        )
        .all()
    )


async def _send_notifications_job() -> None:
    """Async job that runs every minute."""
    bot = get_bot()
    if not bot:
        return

    db = SessionLocal()
    try:
        tz = ZoneInfo(_default_tz)
        now = datetime.now(tz)
        target_date = now.date()
        users = _get_users_to_notify(db, now)

        for user in users:
            try:
                today_txs, overdue_txs = get_planned_transactions_for_notification(
                    db, user, target_date
                )
                text = build_notification_text(today_txs, overdue_txs, target_date)
                await bot.send_message(chat_id=user.telegram_chat_id, text=text)
            except Exception as e:
                logger.exception("Failed to send notification to user %s: %s", user.id, e)
    finally:
        db.close()


def start_scheduler() -> None:
    """Start the notification scheduler."""
    global _scheduler
    if _scheduler:
        return

    _scheduler = AsyncIOScheduler(timezone=_default_tz)
    _scheduler.add_job(
        _send_notifications_job,
        "interval",
        minutes=1,
        id="telegram_notify",
    )
    _scheduler.start()
    logger.info("Telegram notification scheduler started")


def stop_scheduler() -> None:
    """Stop the scheduler."""
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Telegram notification scheduler stopped")
