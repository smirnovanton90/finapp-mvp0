"""API endpoints for Telegram bot linking."""

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from db import get_db
from models import TelegramLinkCode, User
from schemas import TelegramLinkCodeOut, TelegramStatusOut

router = APIRouter(prefix="/users/me/telegram", tags=["telegram"])

LINK_CODE_TTL_MINUTES = 10


def _format_notify_time(user: User) -> str:
    h = user.telegram_notify_hour if user.telegram_notify_hour is not None else 8
    m = user.telegram_notify_minute if user.telegram_notify_minute is not None else 0
    return f"{h:02d}:{m:02d}"


@router.post("/link-code", response_model=TelegramLinkCodeOut)
def create_link_code(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate a 6-digit code for linking Telegram account."""
    db.query(TelegramLinkCode).filter(TelegramLinkCode.user_id == user.id).delete()
    code = "".join(secrets.choice("0123456789") for _ in range(6))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=LINK_CODE_TTL_MINUTES)
    link_code = TelegramLinkCode(
        user_id=user.id,
        code=code,
        expires_at=expires_at,
    )
    db.add(link_code)
    db.commit()
    return TelegramLinkCodeOut(code=code, expires_at=expires_at)


@router.get("", response_model=TelegramStatusOut)
def get_telegram_status(
    user: User = Depends(get_current_user),
):
    """Get Telegram linking status and notification settings."""
    return TelegramStatusOut(
        linked=user.telegram_chat_id is not None,
        telegram_chat_id=user.telegram_chat_id,
        notify_time=_format_notify_time(user),
        notify_enabled=user.telegram_notify_enabled,
    )


@router.delete("")
def unlink_telegram(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Unlink Telegram account."""
    if user.telegram_chat_id is None:
        raise HTTPException(status_code=400, detail="Telegram is not linked")
    user.telegram_chat_id = None
    user.telegram_notify_hour = None
    user.telegram_notify_minute = None
    user.telegram_notify_enabled = True
    db.query(TelegramLinkCode).filter(TelegramLinkCode.user_id == user.id).delete()
    db.commit()
    return {"detail": "Telegram unlinked"}
