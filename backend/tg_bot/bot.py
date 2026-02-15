"""Telegram bot setup and lifecycle."""

import asyncio
import logging
from datetime import date, datetime, timezone

from telegram import Bot
from telegram.ext import Application, CommandHandler

from config import settings
from tg_bot.handlers import (
    cmd_bug,
    cmd_notify,
    cmd_settings,
    cmd_start,
    cmd_time,
    cmd_unlink,
)

logger = logging.getLogger(__name__)

_application: Application | None = None
_bot_task: asyncio.Task | None = None


def _create_application() -> Application:
    if not settings.telegram_bot_token:
        raise ValueError("TELEGRAM_BOT_TOKEN is not set")

    app = (
        Application.builder()
        .token(settings.telegram_bot_token)
        .build()
    )

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("unlink", cmd_unlink))
    app.add_handler(CommandHandler("settings", cmd_settings))
    app.add_handler(CommandHandler("time", cmd_time))
    app.add_handler(CommandHandler("notify", cmd_notify))
    app.add_handler(CommandHandler("bug", cmd_bug))

    return app


async def run_bot() -> None:
    """Start the bot in polling mode. Runs until stopped."""
    global _application, _bot_task
    if not settings.telegram_bot_token:
        logger.warning("TELEGRAM_BOT_TOKEN not set, skipping bot startup")
        return

    _application = _create_application()
    await _application.initialize()
    await _application.start()
    _bot_task = asyncio.create_task(
        _application.updater.start_polling(drop_pending_updates=True)
    )
    logger.info("Telegram bot started")


async def stop_bot() -> None:
    """Stop the bot."""
    global _application, _bot_task
    if _application and _bot_task:
        await _application.updater.stop()
        try:
            await asyncio.wait_for(_bot_task, timeout=5.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            _bot_task.cancel()
            try:
                await _bot_task
            except asyncio.CancelledError:
                pass
        await _application.stop()
        await _application.shutdown()
        _application = None
        _bot_task = None
        logger.info("Telegram bot stopped")


def get_bot() -> Bot | None:
    """Get the bot instance for sending messages. Returns None if bot not started."""
    if _application:
        return _application.bot
    return None
