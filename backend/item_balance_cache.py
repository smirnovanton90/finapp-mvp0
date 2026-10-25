"""Текущее сальдо читается из items.current_balance_minor.

Полный проигрыш цепочки остаётся для сверки и для сальдо на прошлую дату.
Сверка один раз на процесс чинит исторический рассинхрон, после чего экраны
не пересчитывают транзакции.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from market_utils import is_crypto_item, is_moex_item
from models import Item, Transaction
from timezones import transaction_instant
from transactions import transfer_delta

logger = logging.getLogger(__name__)

SETTLEMENT_TYPE = "counterparty_settlements"

_reconciled_user_ids: set[int] = set()
_reconcile_lock = threading.Lock()


def signed_item_delta(tx: Transaction, item_id: int, items_by_id: dict[int, Item]) -> int:
    """Дельта транзакции в валюте счёта item_id. Та же формула, что у контрольных точек."""
    amt = tx.amount_primary_minor or 0
    amt_counterparty_raw = tx.amount_counterparty if tx.amount_counterparty is not None else amt
    if tx.primary_item_id == item_id:
        if tx.direction == "INCOME":
            return amt
        if tx.direction == "EXPENSE":
            return -amt
        if tx.direction == "TRANSFER":
            primary = items_by_id.get(tx.primary_item_id)
            counter = items_by_id.get(tx.counterparty_item_id) if tx.counterparty_item_id else None
            kind = primary.kind if primary else "ASSET"
            primary_is_settlement = getattr(primary, "type_code", None) == SETTLEMENT_TYPE
            counter_is_settlement = getattr(counter, "type_code", None) == SETTLEMENT_TYPE
            if primary_is_settlement and not counter_is_settlement:
                amt_primary = amt_counterparty_raw
            elif counter_is_settlement and not primary_is_settlement:
                amt_primary = amt
            else:
                amt_primary = amt
            return transfer_delta(kind, True, amt_primary)
    if tx.counterparty_item_id == item_id and tx.direction == "TRANSFER":
        primary = items_by_id.get(tx.primary_item_id)
        counter = items_by_id.get(tx.counterparty_item_id)
        kind = counter.kind if counter else "ASSET"
        primary_is_settlement = getattr(primary, "type_code", None) == SETTLEMENT_TYPE
        counter_is_settlement = getattr(counter, "type_code", None) == SETTLEMENT_TYPE
        if primary_is_settlement and not counter_is_settlement:
            amt_counter = amt
        elif counter_is_settlement and not primary_is_settlement:
            amt_counter = amt_counterparty_raw
        else:
            amt_counter = amt_counterparty_raw
        return transfer_delta(kind, False, amt_counter)
    return 0


def _is_replay_balance_item(item: Item) -> bool:
    primary = (item.primary_value_kind or "BALANCE").upper()
    if primary != "BALANCE":
        return False
    if is_moex_item(item) or is_crypto_item(item):
        return False
    return True


def _occurred(tx: Transaction, at_utc: datetime) -> bool:
    instant = transaction_instant(tx.transaction_date, getattr(tx, "timezone", None))
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=timezone.utc)
    return instant.astimezone(timezone.utc) <= at_utc


def replay_current_balances(db: Session, user_id: int, at: datetime | None = None) -> dict[int, int]:
    """Сальдо всех обычных балансовых активов одним проходом по фактическим транзакциям."""
    at_utc = at or datetime.now(timezone.utc)
    if at_utc.tzinfo is None:
        at_utc = at_utc.replace(tzinfo=timezone.utc)
    else:
        at_utc = at_utc.astimezone(timezone.utc)

    items = db.query(Item).filter(Item.user_id == user_id).all()
    items_by_id = {item.id: item for item in items}
    balances: dict[int, int] = {}
    for item in items:
        if not _is_replay_balance_item(item):
            continue
        if item.opening_counterparty_item_id is not None:
            balances[item.id] = 0
        else:
            balances[item.id] = item.initial_balance_minor or 0
    if not balances:
        return balances

    txs = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.transaction_type == "ACTUAL",
            Transaction.deleted_at.is_(None),
            Transaction.is_split_parent.is_(False),
            Transaction.balance_applied.is_(True),
        )
        .all()
    )
    txs.sort(key=lambda tx: transaction_instant(tx.transaction_date, getattr(tx, "timezone", None)))
    eligible = set(balances)
    for tx in txs:
        if not _occurred(tx, at_utc):
            continue
        if tx.primary_item_id in eligible:
            balances[tx.primary_item_id] += signed_item_delta(tx, tx.primary_item_id, items_by_id)
        counter_id = tx.counterparty_item_id
        if counter_id is not None and counter_id in eligible and tx.direction == "TRANSFER":
            balances[counter_id] += signed_item_delta(tx, counter_id, items_by_id)
    return balances


def ensure_user_balances_reconciled(db: Session, user_id: int) -> None:
    """Один раз за процесс подогнать current_balance_minor к проигрышу цепочки."""
    if user_id in _reconciled_user_ids:
        return
    with _reconcile_lock:
        if user_id in _reconciled_user_ids:
            return
        db.query(Item).filter(Item.user_id == user_id).with_for_update().all()
        computed = replay_current_balances(db, user_id)
        updated = 0
        if computed:
            items = db.query(Item).filter(Item.user_id == user_id, Item.id.in_(list(computed))).all()
            for item in items:
                value = computed.get(item.id)
                if value is None:
                    continue
                currency = (item.currency_code or "RUB").upper()
                rub_mismatch = currency == "RUB" and item.current_value_rub != value
                if item.current_balance_minor != value or rub_mismatch:
                    item.current_balance_minor = value
                    if currency == "RUB":
                        item.current_value_rub = value
                    updated += 1
        db.commit()
        if updated:
            logger.info(
                "reconciled stored balances user_id=%s updated_items=%s",
                user_id,
                updated,
            )
        _reconciled_user_ids.add(user_id)
