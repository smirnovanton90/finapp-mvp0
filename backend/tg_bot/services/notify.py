"""Service for building planned transaction notifications."""

from datetime import date, datetime, time
from typing import TYPE_CHECKING

from sqlalchemy import and_
from sqlalchemy.orm import Session, selectinload

from models import Transaction, User


def get_planned_transactions_for_notification(
    db: Session,
    user: User,
    target_date: date,
) -> tuple[list[Transaction], list[Transaction]]:
    """Get today's and overdue planned transactions for a user.

    Returns (today_transactions, overdue_transactions).
    """
    base_filter = and_(
        Transaction.user_id == user.id,
        Transaction.transaction_type == "PLANNED",
        Transaction.deleted_at.is_(None),
        Transaction.status != "REALIZED",
    )

    today_start = datetime.combine(target_date, time.min)
    today_end = datetime.combine(target_date, time.max)

    today_txs = (
        db.query(Transaction)
        .filter(
            base_filter,
            Transaction.transaction_date >= today_start,
            Transaction.transaction_date <= today_end,
        )
        .options(
            selectinload(Transaction.chain),
            selectinload(Transaction.primary_item),
            selectinload(Transaction.counterparty_item),
            selectinload(Transaction.category),
        )
        .order_by(Transaction.transaction_date)
        .all()
    )

    overdue_txs = (
        db.query(Transaction)
        .filter(
            base_filter,
            Transaction.transaction_date < today_start,
        )
        .options(
            selectinload(Transaction.chain),
            selectinload(Transaction.primary_item),
            selectinload(Transaction.counterparty_item),
            selectinload(Transaction.category),
        )
        .order_by(Transaction.transaction_date)
        .all()
    )

    return today_txs, overdue_txs


def format_amount_rub(cents: int, direction: str) -> str:
    """Format amount in rubles with sign."""
    rub = cents / 100
    if direction == "INCOME":
        return f"+{rub:,.0f} ₽".replace(",", " ")
    if direction == "EXPENSE":
        return f"-{rub:,.0f} ₽".replace(",", " ")
    return f"{rub:,.0f} ₽".replace(",", " ")


def _get_item_display_name(tx: Transaction) -> str:
    """Get display name for transaction's primary side."""
    item = tx.primary_item or tx.primary_card_item
    if item:
        return item.name
    return "—"


def _get_tx_display_name(tx: Transaction) -> str:
    """Get display name for transaction (chain or category)."""
    if tx.chain:
        return tx.chain.name
    if tx.category:
        return tx.category.name
    return "Операция"


def build_notification_text(
    today_txs: list[Transaction],
    overdue_txs: list[Transaction],
    target_date: date,
) -> str:
    """Build notification message text."""
    date_str = target_date.strftime("%d.%m.%Y")
    lines = [f"Плановые операции на {date_str}", ""]

    if today_txs:
        lines.append("Сегодня:")
        for tx in today_txs:
            name = _get_tx_display_name(tx)
            amount = format_amount_rub(tx.amount_rub, tx.direction)
            item_name = _get_item_display_name(tx)
            lines.append(f"• {name} — {amount} ({item_name})")
        lines.append("")

    if overdue_txs:
        lines.append("Просроченные:")
        for tx in overdue_txs:
            name = _get_tx_display_name(tx)
            amount = format_amount_rub(tx.amount_rub, tx.direction)
            item_name = _get_item_display_name(tx)
            tx_date = tx.transaction_date.date()
            date_str_tx = tx_date.strftime("%d.%m.%Y")
            lines.append(f"• {name} — {amount} ({item_name}, с {date_str_tx})")
        lines.append("")

    if not today_txs and not overdue_txs:
        lines.append("Нет плановых операций на сегодня и просроченных.")

    return "\n".join(lines).strip()
