from dataclasses import dataclass
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from db import get_db
from auth import get_current_user
from category_service import resolve_category_or_400
from models import Transaction, Item, User, Counterparty
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


@dataclass(frozen=True)
class ResolvedSide:
    selected_item: Item
    effective_item: Item
    card_item: Item | None
    start_date: date


def _resolve_min_date(user: User, item: Item, account: Item | None = None) -> date:
    if not user.accounting_start_date:
        raise HTTPException(status_code=400, detail="Accounting start date is not set.")
    min_date = user.accounting_start_date
    if item.open_date and item.open_date > min_date:
        min_date = item.open_date
    if account and account.open_date and account.open_date > min_date:
        min_date = account.open_date
    return min_date


def _load_item(
    db: Session, user: User, item_id: int, lock: bool, role_label: str
) -> Item:
    query = db.query(Item).filter(Item.id == item_id, Item.user_id == user.id)
    if lock:
        query = query.with_for_update()
    item = query.first()
    if not item:
        raise HTTPException(status_code=400, detail=f"Invalid {role_label}_item_id")
    return item


def _resolve_effective_side(
    db: Session, user: User, item_id: int, lock: bool, role_label: str
) -> ResolvedSide:
    item = _load_item(db, user, item_id, lock, role_label)
    if item.type_code != "bank_card" or not item.card_account_id:
        return ResolvedSide(
            selected_item=item,
            effective_item=item,
            card_item=None,
            start_date=_resolve_min_date(user, item),
        )

    account = _load_item(db, user, item.card_account_id, lock, role_label)
    if account.type_code != "bank_account" or account.kind != "ASSET":
        raise HTTPException(status_code=400, detail="Invalid card_account_id")
    if account.currency_code != item.currency_code:
        raise HTTPException(
            status_code=400, detail="Card and account currencies must match"
        )
    if account.bank_id != item.bank_id:
        raise HTTPException(status_code=400, detail="Card and account banks must match")

    start_date = _resolve_min_date(user, item, account)
    return ResolvedSide(
        selected_item=item,
        effective_item=account,
        card_item=item,
        start_date=start_date,
    )

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


def get_min_balance(item: Item) -> int:
    if item.type_code == "bank_card" and item.card_kind == "CREDIT":
        return -(item.credit_limit or 0)
    return 0


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


def resolve_counterparty(
    db: Session,
    user: User,
    counterparty_id: int | None,
) -> Counterparty | None:
    if counterparty_id is None:
        return None
    counterparty = db.get(Counterparty, counterparty_id)
    if (
        not counterparty
        or counterparty.deleted_at is not None
        or (
            counterparty.owner_user_id is not None
            and counterparty.owner_user_id != user.id
        )
    ):
        raise HTTPException(status_code=400, detail="Invalid counterparty_id")
    return counterparty


def insufficient_funds_detail(amount: int, balance: int, item_name: str, tx_date) -> str:
    amount_label = format_amount_value(amount)
    balance_label = format_amount_value(balance)
    date_label = format_tx_datetime(tx_date)
    return (
        f"Недостаточно средств для добавления транзакции по счету \"{item_name}\". "
        f"Сумма: {amount_label}, остаток на дату {date_label}: {balance_label}. "
        "Добавление транзакции приведет к отрицательному остатку."
    )


def balance_violation_detail(item: Item, amount: int, tx_date) -> str:
    min_balance = get_min_balance(item)
    if min_balance < 0:
        limit_label = format_amount_value(abs(min_balance))
        return (
            "Сумма транзакции превышает кредитный лимит по "
            f"{item.name}. Текущий кредитный лимит: {limit_label}."
        )
    return insufficient_funds_detail(
        amount=amount,
        balance=item.current_value_rub,
        item_name=item.name,
        tx_date=tx_date,
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
    card_item_ids: list[int] | None = Query(default=None),
    currency_item_ids: list[int] | None = Query(default=None),
    category_ids: list[int] | None = Query(default=None),
    counterparty_ids: list[int] | None = Query(default=None),
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
    if counterparty_ids:
        stmt = stmt.where(Transaction.counterparty_id.in_(counterparty_ids))
    item_filters = []
    if item_ids:
        item_filters.append(
            or_(
                Transaction.primary_item_id.in_(item_ids),
                Transaction.counterparty_item_id.in_(item_ids),
            )
        )
    if card_item_ids:
        item_filters.append(
            or_(
                Transaction.primary_card_item_id.in_(card_item_ids),
                Transaction.counterparty_card_item_id.in_(card_item_ids),
            )
        )
    if item_filters:
        stmt = stmt.where(or_(*item_filters))
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
    primary_side = _resolve_effective_side(db, user, data.primary_item_id, True, "primary")
    primary = primary_side.effective_item

    tx_date = data.transaction_date.date()
    if tx_date < primary_side.start_date:
        raise HTTPException(
            status_code=400,
            detail="Дата транзакции не может быть раньше даты начала действия актива/обязательства.",
        )

    resolve_counterparty(db, user, data.counterparty_id)

    counter_side = None
    counter = None
    amount_counterparty = None

    if data.direction == "TRANSFER":
        if not data.counterparty_item_id:
            raise HTTPException(
                status_code=400,
                detail="counterparty_item_id is required for TRANSFER",
            )

        counter_side = _resolve_effective_side(
            db, user, data.counterparty_item_id, True, "counterparty"
        )
        counter = counter_side.effective_item

        if counter_side.selected_item.id == primary_side.selected_item.id:
            raise HTTPException(status_code=400, detail="Transfer items must be different")
        if counter.id == primary.id:
            raise HTTPException(status_code=400, detail="Transfer items must be different")

        if tx_date < counter_side.start_date:
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
        if data.counterparty_item_id is not None:
            raise HTTPException(
                status_code=400,
                detail="counterparty_item_id is only allowed for TRANSFER",
            )

    status_value = data.status or "CONFIRMED"

    category = resolve_category_or_400(db, user, data.category_id)

    tx = Transaction(
        user_id=user.id,
        transaction_date=data.transaction_date,
        primary_item_id=primary.id,
        primary_card_item_id=primary_side.card_item.id if primary_side.card_item else None,
        counterparty_item_id=counter.id if counter_side else None,
        counterparty_card_item_id=(
            counter_side.card_item.id if counter_side and counter_side.card_item else None
        ),
        counterparty_id=data.counterparty_id,
        amount_rub=data.amount_rub,
        amount_counterparty=amount_counterparty,
        direction=data.direction,
        transaction_type=data.transaction_type,
        status=status_value,
        category_id=category.id if category else None,
        description=data.description,
        comment=data.comment,
    )

    if data.transaction_type == "ACTUAL":
        amt = data.amount_rub

        if data.direction == "INCOME":
            primary.current_value_rub += amt

        elif data.direction == "EXPENSE":
            next_balance = primary.current_value_rub - amt
            if next_balance < get_min_balance(primary):
                raise HTTPException(
                    status_code=400,
                    detail=balance_violation_detail(primary, amt, data.transaction_date),
                )
            primary.current_value_rub = next_balance

        elif data.direction == "TRANSFER":
            if not counter:
                raise HTTPException(status_code=400, detail="Counterparty item not found")
            amt_counterparty = amount_counterparty or amt
            primary_delta = transfer_delta(primary.kind, True, amt)
            counter_delta = transfer_delta(counter.kind, False, amt_counterparty)
            primary_next = primary.current_value_rub + primary_delta
            if primary_next < get_min_balance(primary):
                raise HTTPException(
                    status_code=400,
                    detail=balance_violation_detail(primary, -primary_delta, data.transaction_date),
                )
            counter_next = counter.current_value_rub + counter_delta
            if counter_next < get_min_balance(counter):
                raise HTTPException(
                    status_code=400,
                    detail=balance_violation_detail(counter, -counter_delta, data.transaction_date),
                )
            primary.current_value_rub = primary_next
            counter.current_value_rub = counter_next

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

    old_primary = (
        db.query(Item)
        .filter(Item.id == tx.primary_item_id, Item.user_id == user.id)
        .with_for_update()
        .first()
    )
    if not old_primary:
        raise HTTPException(status_code=400, detail="Primary item not found")

    old_counter = None
    if tx.direction == "TRANSFER":
        if not tx.counterparty_item_id:
            raise HTTPException(status_code=400, detail="Broken transfer transaction")
        old_counter = (
            db.query(Item)
            .filter(Item.id == tx.counterparty_item_id, Item.user_id == user.id)
            .with_for_update()
            .first()
        )
        if not old_counter:
            raise HTTPException(status_code=400, detail="Counterparty item not found")

    new_primary_side = _resolve_effective_side(
        db, user, data.primary_item_id, True, "primary"
    )
    new_primary = new_primary_side.effective_item

    new_tx_date = data.transaction_date.date()
    if new_tx_date < new_primary_side.start_date:
        raise HTTPException(
            status_code=400,
            detail="Transaction date cannot be earlier than the item's start date.",
        )

    resolve_counterparty(db, user, data.counterparty_id)

    new_counter_side = None
    new_counter = None
    amount_counterparty = None

    if data.direction == "TRANSFER":
        if not data.counterparty_item_id:
            raise HTTPException(
                status_code=400,
                detail="counterparty_item_id is required for TRANSFER",
            )

        new_counter_side = _resolve_effective_side(
            db, user, data.counterparty_item_id, True, "counterparty"
        )
        new_counter = new_counter_side.effective_item

        if new_counter_side.selected_item.id == new_primary_side.selected_item.id:
            raise HTTPException(status_code=400, detail="Transfer items must be different")
        if new_counter.id == new_primary.id:
            raise HTTPException(status_code=400, detail="Transfer items must be different")

        if new_tx_date < new_counter_side.start_date:
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

    items_by_id = {
        item.id: item
        for item in [old_primary, old_counter, new_primary, new_counter]
        if item is not None
    }

    for item_id, delta in deltas.items():
        item = items_by_id.get(item_id)
        if not item:
            raise HTTPException(status_code=400, detail="Item not found")
        min_balance = get_min_balance(item)
        if item.current_value_rub + delta < min_balance:
            detail = "Cannot update: would make balance negative. Update later transactions first."
            if min_balance < 0:
                detail = "Cannot update: would exceed credit limit. Update later transactions first."
            raise HTTPException(
                status_code=409,
                detail=detail,
            )

    for item_id, delta in deltas.items():
        items_by_id[item_id].current_value_rub += delta

    category = resolve_category_or_400(db, user, data.category_id)

    tx.transaction_date = data.transaction_date
    tx.primary_item_id = new_primary.id
    tx.primary_card_item_id = (
        new_primary_side.card_item.id if new_primary_side.card_item else None
    )
    tx.counterparty_item_id = new_counter.id if data.direction == "TRANSFER" else None
    tx.counterparty_card_item_id = (
        new_counter_side.card_item.id
        if data.direction == "TRANSFER" and new_counter_side and new_counter_side.card_item
        else None
    )
    tx.counterparty_id = data.counterparty_id
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


def _apply_transaction_soft_delete(db: Session, user: User, tx: Transaction) -> None:
    if tx.deleted_at is not None:
        return

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

    if tx.transaction_type == "ACTUAL":
        amt = tx.amount_rub
        amt_counterparty = tx.amount_counterparty or amt

        if tx.direction == "INCOME":
            next_balance = primary.current_value_rub - amt
            if next_balance < get_min_balance(primary):
                raise HTTPException(
                    status_code=409,
                    detail="Cannot delete: would make balance negative. Delete later transactions first.",
                )
            primary.current_value_rub = next_balance
        elif tx.direction == "EXPENSE":
            primary.current_value_rub += amt
        elif tx.direction == "TRANSFER":
            primary_delta = -transfer_delta(primary.kind, True, amt)
            counter_delta = -transfer_delta(counter.kind, False, amt_counterparty)
            if primary.current_value_rub + primary_delta < get_min_balance(primary):
                raise HTTPException(
                    status_code=409,
                    detail="Cannot delete: would make balance negative. Delete later transactions first.",
                )
            if counter.current_value_rub + counter_delta < get_min_balance(counter):
                raise HTTPException(
                    status_code=409,
                    detail="Cannot delete: would make counterparty balance negative. Delete later transactions first.",
                )
            primary.current_value_rub += primary_delta
            counter.current_value_rub += counter_delta

    tx.deleted_at = datetime.now(timezone.utc)


def purge_card_transactions(db: Session, user: User, card_item_id: int) -> int:
    txs = (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id)
        .filter(Transaction.deleted_at.is_(None))
        .filter(
            or_(
                Transaction.primary_item_id == card_item_id,
                Transaction.counterparty_item_id == card_item_id,
                Transaction.primary_card_item_id == card_item_id,
                Transaction.counterparty_card_item_id == card_item_id,
            )
        )
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        .with_for_update()
        .all()
    )
    for tx in txs:
        _apply_transaction_soft_delete(db, user, tx)
    return len(txs)


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
    tx = (
        db.query(Transaction)
        .filter(Transaction.id == tx_id, Transaction.user_id == user.id)
        .with_for_update()
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if tx.deleted_at is not None:
        return {"ok": True}

    _apply_transaction_soft_delete(db, user, tx)

    db.commit()
    return {"ok": True}
