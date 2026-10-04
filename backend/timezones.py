"""Часовые пояса транзакций и профиля.

Местное время хранится без смещения. Пояс говорит, в какой зоне эти цифры сказаны.
Абсолютный момент — местные часы в этом поясе.
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TIMEZONE = "Europe/Moscow"


def normalize_timezone(name: str | None) -> str:
    candidate = (name or "").strip() or DEFAULT_TIMEZONE
    try:
        ZoneInfo(candidate)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        return DEFAULT_TIMEZONE
    return candidate


def validate_timezone(name: str) -> str:
    candidate = (name or "").strip()
    if not candidate:
        raise ValueError("Укажите часовой пояс.")
    try:
        ZoneInfo(candidate)
    except (ZoneInfoNotFoundError, ValueError, KeyError) as exc:
        raise ValueError("Неизвестный часовой пояс.") from exc
    return candidate


def as_wall_clock(value: datetime) -> datetime:
    """Цифры часов как их ввели, без перевода в UTC."""
    if value.tzinfo is not None:
        return value.replace(tzinfo=None)
    return value


def resolve_timezone_name(requested: str | None, user: object) -> str:
    if requested and requested.strip():
        return validate_timezone(requested)
    return effective_timezone(user)


def effective_timezone(user: object) -> str:
    auto = bool(getattr(user, "timezone_auto", True))
    detected = getattr(user, "timezone_detected", None)
    manual = getattr(user, "timezone", None) or DEFAULT_TIMEZONE
    if auto and detected:
        return normalize_timezone(detected)
    return normalize_timezone(manual)


def transaction_instant(value: datetime, tz_name: str | None) -> datetime:
    wall = as_wall_clock(value)
    zone = ZoneInfo(normalize_timezone(tz_name))
    return wall.replace(tzinfo=zone)


def is_occurred(
    value: datetime,
    tz_name: str | None,
    now: datetime | None = None,
) -> bool:
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return transaction_instant(value, tz_name) <= current


def today_in_timezone(tz_name: str | None) -> datetime:
    return datetime.now(ZoneInfo(normalize_timezone(tz_name)))
