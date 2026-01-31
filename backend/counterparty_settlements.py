"""Counterparty settlements (Взаиморасчёты) — system-created items per counterparty."""

from datetime import datetime, date, timezone
from sqlalchemy.orm import Session

from models import Item, User, Counterparty


COUNTERPARTY_SETTLEMENTS_TYPE = "counterparty_settlements"
SETTLEMENTS_NAME_PREFIX = "Взаиморасчёты: "


def ensure_counterparty_settlements_item(
    db: Session,
    user: User,
    counterparty_id: int,
    currency_code: str,
    open_date: date,
    accounting_start_date: date,
) -> Item:
    """Get or create the single «Взаиморасчёты» item for (user, counterparty)."""
    existing = (
        db.query(Item)
        .filter(
            Item.user_id == user.id,
            Item.type_code == COUNTERPARTY_SETTLEMENTS_TYPE,
            Item.counterparty_id == counterparty_id,
            Item.archived_at.is_(None),
        )
        .first()
    )
    if existing:
        return existing

    counterparty = db.get(Counterparty, counterparty_id)
    if not counterparty or (counterparty.owner_user_id and counterparty.owner_user_id != user.id):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid counterparty_id")

    name = f"{SETTLEMENTS_NAME_PREFIX}{counterparty.name or 'Контрагент'}"

    item = Item(
        user_id=user.id,
        kind="ASSET",
        type_code=COUNTERPARTY_SETTLEMENTS_TYPE,
        name=name,
        currency_code=currency_code,
        counterparty_id=counterparty_id,
        open_date=open_date,
        initial_value_rub=0,
        current_value_rub=0,
        start_date=accounting_start_date,
        history_status="NEW",
    )
    db.add(item)
    db.flush()
    return item


def update_settlements_item_closed_status(db: Session, item: Item) -> None:
    """If item is counterparty_settlements: set closed_at when balance is 0, clear when non-zero."""
    if item.type_code != COUNTERPARTY_SETTLEMENTS_TYPE:
        return
    if item.current_value_rub == 0:
        if item.closed_at is None:
            item.closed_at = datetime.now(timezone.utc)
    else:
        item.closed_at = None
