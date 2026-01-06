from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from db import get_db
from auth import get_current_user
from category_service import resolve_category_or_400
from models import Transaction, Item, User
from schemas import (
    TransactionCreate,
    TransactionOut,
    TransactionStatusUpdate,
    TransactionPageOut,
    TransactionDirection,
    TransactionStatus,
    TransactionType,
)
from sqlalchemy import select, and_, or_, func
from datetime import date, datetime, time, timezone

router = APIRouter(prefix="/transactions", tags=["transactions"])

def _parse_cursor(value: str) -> tuple[datetime, int]:
    parts = value.split("|", 1)
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Invalid cursor format")
    try:
        cursor_dt = datetime.fromisoformat(parts[0])
        cursor_id = int(parts[1])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid cursor value") from exc
    if cursor_dt.tzinfo is not None:
        cursor_dt = cursor_dt.replace(tzinfo=None)
    return cursor_dt, cursor_id

def transfer_delta(kind: str, is_primary: bool, amount: int) -> int:
    if kind == "LIABILITY":
        return amount if is_primary else -amount
    return -amount if is_primary else amount


def format_amount_value(value: int) -> str:
    abs_value = abs(value)
    if abs_value % 100 == 0:
        rubles = abs_value // 100
        formatted = f"{rubles:,}"
        return formatted.replace(",", " ")
    rub = abs_value / 100
    formatted = f"{rub:,.2f}"
    return formatted.replace(",", " ").replace(".", ",")


def format_tx_datetime(value: datetime | date) -> str:
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.combine(value, datetime.min.time())
    return dt.strftime("%d.%m.%Y %H:%M")


def insufficient_funds_detail(amount: int, balance: int, item_name: str, tx_date) -> str:
    amount_label = format_amount_value(amount)
    balance_label = format_amount_value(balance)
    date_label = format_tx_datetime(tx_date)
    return (
        f"Недостаточно средств для добавления транзакции по счету \"{item_name}\". "
        f"Сумма: {amount_label}, остаток на дату {date_label}: {balance_label}. "
        "Добавление транзакции приведет к отрицательному остатку."
    )


@router.get("", response_model=list[TransactionOut])
def list_transactions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # показываем только транзакции текущего пользователя
    return (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id)
        .filter(Transaction.deleted_at.is_(None))
        .options(selectinload(Transaction.chain))
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        .all()
    )


@router.get("/page", response_model=TransactionPageOut)
def list_transactions_page(
    limit: int = Query(50, ge=1, le=200),
    cursor: str | None = None,
    include_deleted: bool = False,
    deleted_only: bool = False,
    date_from: date | None = None,
    date_to: date | None = None,
    status: list[TransactionStatus] | None = Query(default=None),
    direction: list[TransactionDirection] | None = Query(default=None),
    transaction_type: list[TransactionType] | None = Query(default=None),
    item_ids: list[int] | None = Query(default=None),
    currency_item_ids: list[int] | None = Query(default=None),
    category_ids: list[int] | None = Query(default=None),
    comment_query: str | None = None,
    min_amount: int | None = Query(default=None, ge=0),
    max_amount: int | None = Query(default=None, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Transaction).where(Transaction.user_id == user.id)

    if deleted_only:
        stmt = stmt.where(Transaction.deleted_at.isnot(None))
    elif not include_deleted:
        stmt = stmt.where(Transaction.deleted_at.is_(None))

    if date_from:
        stmt = stmt.where(
            Transaction.transaction_date >= datetime.combine(date_from, time.min)
        )
    if date_to:
        stmt = stmt.where(
            Transaction.transaction_date <= datetime.combine(date_to, time.max)
        )
    if status:
        stmt = stmt.where(Transaction.status.in_(status))
    if direction:
        stmt = stmt.where(Transaction.direction.in_(direction))
    if transaction_type:
        stmt = stmt.where(Transaction.transaction_type.in_(transaction_type))
    if category_ids:
        stmt = stmt.where(Transaction.category_id.in_(category_ids))
    if item_ids:
        stmt = stmt.where(
            or_(
                Transaction.primary_item_id.in_(item_ids),
                Transaction.counterparty_item_id.in_(item_ids),
            )
        )
    if currency_item_ids:
        stmt = stmt.where(
            or_(
                Transaction.primary_item_id.in_(currency_item_ids),
                Transaction.counterparty_item_id.in_(currency_item_ids),
            )
        )
    if comment_query:
        trimmed = comment_query.strip()
        if trimmed:
            stmt = stmt.where(Transaction.comment.ilike(f"%{trimmed}%"))
    if min_amount is not None or max_amount is not None:
        abs_amount = func.abs(Transaction.amount_rub)
        if min_amount is not None:
            stmt = stmt.where(abs_amount >= min_amount)
        if max_amount is not None:
            stmt = stmt.where(abs_amount <= max_amount)
    if cursor:
        cursor_dt, cursor_id = _parse_cursor(cursor)
        stmt = stmt.where(
            or_(
                Transaction.transaction_date < cursor_dt,
                and_(
                    Transaction.transaction_date == cursor_dt,
                    Transaction.id < cursor_id,
                ),
            )
        )

    stmt = (
        stmt.options(selectinload(Transaction.chain))
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        .limit(limit + 1)
    )
    rows = list(db.execute(stmt).scalars())
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]
    next_cursor = None
    if rows:
        last = rows[-1]
        next_cursor = f"{last.transaction_date.isoformat()}|{last.id}"

    return TransactionPageOut(items=rows, next_cursor=next_cursor, has_more=has_more)


@router.get("/deleted", response_model=list[TransactionOut])
def list_deleted_transactions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id)
        .filter(Transaction.deleted_at.isnot(None))
        .options(selectinload(Transaction.chain))
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        .all()
    )


@router.post("", response_model=TransactionOut)
@router.post("", response_model=TransactionOut)
def create_transaction(
    data: TransactionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # 1) Проверяем, что primary_item принадлежит пользователю
    primary = (
        db.query(Item)
        .filter(Item.id == data.primary_item_id, Item.user_id == user.id)
        .with_for_update()
        .first()
    )
    if not primary:
        raise HTTPException(status_code=400, detail="Invalid primary_item_id")

    tx_date = data.transaction_date.date()
    if tx_date < primary.start_date:
        raise HTTPException(
            status_code=400,
            detail="Дата транзакции не может быть раньше даты начала действия актива/обязательства.",
        )

    counter = None
    amount_counterparty = None

    # 2) Правила для TRANSFER
    if data.direction == "TRANSFER":
        if not data.counterparty_item_id:
            raise HTTPException(
                status_code=400,
                detail="counterparty_item_id is required for TRANSFER",
            )

        counter = (
            db.query(Item)
            .filter(Item.id == data.counterparty_item_id, Item.user_id == user.id)
            .with_for_update()
            .first()
        )
        if not counter:
            raise HTTPException(status_code=400, detail="Invalid counterparty_item_id")

        if counter.id == primary.id:
            raise HTTPException(status_code=400, detail="Transfer items must be different")

        if tx_date < counter.start_date:
            raise HTTPException(
                status_code=400,
                detail="Дата транзакции не может быть раньше даты начала действия корреспондирующего актива/обязательства.",
            )

        if primary.currency_code != counter.currency_code:
            if data.amount_counterparty is None:
                raise HTTPException(
                    status_code=400,
                    detail="amount_counterparty is required for cross-currency transfer",
                )
            amount_counterparty = data.amount_counterparty
        else:
            if data.amount_counterparty is None:
                amount_counterparty = data.amount_rub
            elif data.amount_counterparty != data.amount_rub:
                raise HTTPException(
                    status_code=400,
                    detail="amount_counterparty must match amount_rub for same-currency transfer",
                )
            else:
                amount_counterparty = data.amount_counterparty
    else:
        # для INCOME/EXPENSE корр. актив не нужен
        if data.counterparty_item_id is not None:
            raise HTTPException(
                status_code=400,
                detail="counterparty_item_id is only allowed for TRANSFER",
            )

    # 3) Создаём транзакцию
    status_value = data.status or "CONFIRMED"

    category = resolve_category_or_400(db, user, data.category_id)

    tx = Transaction(
        user_id=user.id,
        transaction_date=data.transaction_date,
        primary_item_id=data.primary_item_id,
        counterparty_item_id=data.counterparty_item_id,
        amount_rub=data.amount_rub,
        amount_counterparty=amount_counterparty,
        direction=data.direction,
        transaction_type=data.transaction_type,
        status=status_value,
        category_id=category.id if category else None,
        description=data.description,
        comment=data.comment,
    )

    # 4) Обновляем балансы ТОЛЬКО для ACTUAL
    if data.transaction_type == "ACTUAL":
        amt = data.amount_rub

        if data.direction == "INCOME":
            primary.current_value_rub += amt

        elif data.direction == "EXPENSE":
            if primary.current_value_rub < amt:
                raise HTTPException(
                    status_code=400,
                    detail=insufficient_funds_detail(
                        amount=amt,
                        balance=primary.current_value_rub,
                        item_name=primary.name,
                        tx_date=data.transaction_date,
                    ),
                )
            primary.current_value_rub -= amt

        elif data.direction == "TRANSFER":
            # counter уже проверен выше
            amt_counterparty = amount_counterparty or amt
            primary_delta = transfer_delta(primary.kind, True, amt)
            counter_delta = transfer_delta(counter.kind, False, amt_counterparty)
            if primary_delta < 0 and primary.current_value_rub < -primary_delta:
                raise HTTPException(
                    status_code=400,
                    detail=insufficient_funds_detail(
                        amount=-primary_delta,
                        balance=primary.current_value_rub,
                        item_name=primary.name,
                        tx_date=data.transaction_date,
                    ),
                )
            if counter_delta < 0 and counter.current_value_rub < -counter_delta:
                raise HTTPException(
                    status_code=400,
                    detail=insufficient_funds_detail(
                        amount=-counter_delta,
                        balance=counter.current_value_rub,
                        item_name=counter.name,
                        tx_date=data.transaction_date,
                    ),
                )
            primary.current_value_rub += primary_delta
            counter.current_value_rub += counter_delta

    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.patch("/{tx_id}", response_model=TransactionOut)
def update_transaction(
    tx_id: int,
    data: TransactionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tx = (
        db.query(Transaction)
        .filter(Transaction.id == tx_id, Transaction.user_id == user.id)
        .with_for_update()
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Cannot edit deleted transaction")

    item_ids = {tx.primary_item_id, data.primary_item_id}
    if tx.counterparty_item_id:
        item_ids.add(tx.counterparty_item_id)
    if data.counterparty_item_id:
        item_ids.add(data.counterparty_item_id)

    items = (
        db.query(Item)
        .filter(Item.id.in_(item_ids), Item.user_id == user.id)
        .with_for_update()
        .all()
    )
    items_by_id = {item.id: item for item in items}

    old_primary = items_by_id.get(tx.primary_item_id)
    if not old_primary:
        raise HTTPException(status_code=400, detail="Primary item not found")
    old_counter = None
    if tx.direction == "TRANSFER":
        if not tx.counterparty_item_id:
            raise HTTPException(status_code=400, detail="Broken transfer transaction")
        old_counter = items_by_id.get(tx.counterparty_item_id)
        if not old_counter:
            raise HTTPException(status_code=400, detail="Counterparty item not found")

    new_primary = items_by_id.get(data.primary_item_id)
    if not new_primary:
        raise HTTPException(status_code=400, detail="Invalid primary_item_id")

    new_tx_date = data.transaction_date.date()
    if new_tx_date < new_primary.start_date:
        raise HTTPException(
            status_code=400,
            detail="Transaction date cannot be earlier than the item's start date.",
        )

    new_counter = None
    amount_counterparty = None

    if data.direction == "TRANSFER":
        if not data.counterparty_item_id:
            raise HTTPException(
                status_code=400,
                detail="counterparty_item_id is required for TRANSFER",
            )

        new_counter = items_by_id.get(data.counterparty_item_id)
        if not new_counter:
            raise HTTPException(status_code=400, detail="Invalid counterparty_item_id")

        if new_counter.id == new_primary.id:
            raise HTTPException(status_code=400, detail="Transfer items must be different")

        if new_tx_date < new_counter.start_date:
            raise HTTPException(
                status_code=400,
                detail="Transaction date cannot be earlier than the counterparty start date.",
            )

        if new_primary.currency_code != new_counter.currency_code:
            if data.amount_counterparty is None:
                raise HTTPException(
                    status_code=400,
                    detail="amount_counterparty is required for cross-currency transfer",
                )
            amount_counterparty = data.amount_counterparty
        else:
            if data.amount_counterparty is None:
                amount_counterparty = data.amount_rub
            elif data.amount_counterparty != data.amount_rub:
                raise HTTPException(
                    status_code=400,
                    detail="amount_counterparty must match amount_rub for same-currency transfer",
                )
            else:
                amount_counterparty = data.amount_counterparty
    else:
        if data.counterparty_item_id is not None:
            raise HTTPException(
                status_code=400,
                detail="counterparty_item_id is only allowed for TRANSFER",
            )

    deltas: dict[int, int] = {}

    def add_delta(item_id: int, delta: int) -> None:
        if delta == 0:
            return
        deltas[item_id] = deltas.get(item_id, 0) + delta

    if tx.transaction_type == "ACTUAL":
        old_amt = tx.amount_rub
        old_counter_amt = (
            tx.amount_counterparty if tx.amount_counterparty is not None else old_amt
        )

        if tx.direction == "INCOME":
            add_delta(old_primary.id, -old_amt)
        elif tx.direction == "EXPENSE":
            add_delta(old_primary.id, old_amt)
        elif tx.direction == "TRANSFER":
            if not old_counter:
                raise HTTPException(status_code=400, detail="Counterparty item not found")
            old_primary_delta = transfer_delta(old_primary.kind, True, old_amt)
            old_counter_delta = transfer_delta(old_counter.kind, False, old_counter_amt)
            add_delta(old_primary.id, -old_primary_delta)
            add_delta(old_counter.id, -old_counter_delta)

    if data.transaction_type == "ACTUAL":
        new_amt = data.amount_rub
        new_counter_amt = (
            amount_counterparty if amount_counterparty is not None else new_amt
        )

        if data.direction == "INCOME":
            add_delta(new_primary.id, new_amt)
        elif data.direction == "EXPENSE":
            add_delta(new_primary.id, -new_amt)
        elif data.direction == "TRANSFER":
            if not new_counter:
                raise HTTPException(status_code=400, detail="Counterparty item not found")
            new_primary_delta = transfer_delta(new_primary.kind, True, new_amt)
            new_counter_delta = transfer_delta(new_counter.kind, False, new_counter_amt)
            add_delta(new_primary.id, new_primary_delta)
            add_delta(new_counter.id, new_counter_delta)

    for item_id, delta in deltas.items():
        item = items_by_id.get(item_id)
        if not item:
            raise HTTPException(status_code=400, detail="Item not found")
        if item.current_value_rub + delta < 0:
            raise HTTPException(
                status_code=409,
                detail="Cannot update: would make balance negative. Update later transactions first.",
            )

    for item_id, delta in deltas.items():
        items_by_id[item_id].current_value_rub += delta

    category = resolve_category_or_400(db, user, data.category_id)

    tx.transaction_date = data.transaction_date
    tx.primary_item_id = data.primary_item_id
    tx.counterparty_item_id = data.counterparty_item_id if data.direction == "TRANSFER" else None
    tx.amount_rub = data.amount_rub
    tx.amount_counterparty = amount_counterparty if data.direction == "TRANSFER" else None
    tx.direction = data.direction
    tx.transaction_type = data.transaction_type
    if data.status is not None:
        tx.status = data.status
    tx.category_id = category.id if category else None
    tx.description = data.description
    tx.comment = data.comment

    db.commit()
    db.refresh(tx)
    return tx


@router.patch("/{tx_id}/status", response_model=TransactionOut)
def update_transaction_status(
    tx_id: int,
    data: TransactionStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tx = (
        db.query(Transaction)
        .filter(Transaction.id == tx_id, Transaction.user_id == user.id)
        .with_for_update()
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Cannot update deleted transaction")

    if tx.status != data.status:
        tx.status = data.status
        db.commit()
        db.refresh(tx)
    return tx

@router.delete("/{tx_id}")
def delete_transaction(
    tx_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Лочим транзакцию, чтобы два удаления не подрались
    tx = (
        db.query(Transaction)
        .filter(Transaction.id == tx_id, Transaction.user_id == user.id)
        .with_for_update()
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if tx.deleted_at is not None:
        # идемпотентность: уже удалена — ок
        return {"ok": True}

    # Лочим primary item
    primary = (
        db.query(Item)
        .filter(Item.id == tx.primary_item_id, Item.user_id == user.id)
        .with_for_update()
        .first()
    )
    if not primary:
        raise HTTPException(status_code=400, detail="Primary item not found")

    counter = None
    if tx.direction == "TRANSFER":
        if not tx.counterparty_item_id:
            raise HTTPException(status_code=400, detail="Broken transfer transaction")
        counter = (
            db.query(Item)
            .filter(Item.id == tx.counterparty_item_id, Item.user_id == user.id)
            .with_for_update()
            .first()
        )
        if not counter:
            raise HTTPException(status_code=400, detail="Counterparty item not found")

    # Откат балансов только для ACTUAL
    if tx.transaction_type == "ACTUAL":
        amt = tx.amount_rub
        amt_counterparty = tx.amount_counterparty or amt

        if tx.direction == "INCOME":
            # откат дохода = минус
            if primary.current_value_rub < amt:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot delete: would make balance negative. Delete later transactions first.",
                )
            primary.current_value_rub -= amt

        elif tx.direction == "EXPENSE":
            # откат расхода = плюс
            primary.current_value_rub += amt

        elif tx.direction == "TRANSFER":
            # откат перевода: вернуть в источник, забрать у получателя
            primary_delta = -transfer_delta(primary.kind, True, amt)
            counter_delta = -transfer_delta(counter.kind, False, amt_counterparty)
            if primary.current_value_rub + primary_delta < 0:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot delete: would make balance negative. Delete later transactions first.",
                )
            if counter.current_value_rub + counter_delta < 0:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot delete: would make counterparty balance negative. Delete later transactions first.",
                )
            primary.current_value_rub += primary_delta
            counter.current_value_rub += counter_delta

    # soft delete
    tx.deleted_at = datetime.now(timezone.utc)

    db.commit()
    return {"ok": True}
