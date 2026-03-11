from dataclasses import dataclass
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from db import get_db
from auth import get_current_user
from category_service import resolve_category_or_400, resolve_category_or_none
from models import Transaction, Item, User, Counterparty, Category
from market_utils import is_crypto_item, is_moex_item
from schemas import (
    TransactionCreate,
    TransactionDebtsCreate,
    TransactionTheyPaidForMeCreate,
    TransactionOut,
    TransactionStatusUpdate,
    TransactionPageOut,
    TransactionSplitCreate,
    TransactionSplitOut,
    TransactionDirection,
    TransactionStatus,
    TransactionType,
)
from sqlalchemy import select, and_, or_, func
from datetime import date, datetime, time, timezone

from counterparty_settlements import (
    ensure_counterparty_settlements_item,
    create_counterparty_settlements_item,
    update_settlements_item_closed_status,
    COUNTERPARTY_SETTLEMENTS_TYPE,
)

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
    if account.counterparty_id != item.counterparty_id:
        raise HTTPException(status_code=400, detail="Card and account counterparties must match")

    start_date = _resolve_min_date(user, item, account)
    return ResolvedSide(
        selected_item=item,
        effective_item=account,
        card_item=item,
        start_date=start_date,
    )

def _parse_cursor(value: str) -> tuple[datetime, datetime | None, int]:
    """Returns (transaction_date, created_at or None, id). Old format 'date|id' supported for backward compatibility."""
    parts = value.split("|")
    if len(parts) == 2:
        try:
            cursor_dt = datetime.fromisoformat(parts[0])
            cursor_id = int(parts[1])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid cursor value") from exc
        if cursor_dt.tzinfo is not None:
            cursor_dt = cursor_dt.replace(tzinfo=None)
        return cursor_dt, None, cursor_id
    if len(parts) != 3:
        raise HTTPException(status_code=400, detail="Invalid cursor format")
    try:
        cursor_dt = datetime.fromisoformat(parts[0])
        cursor_created_at = datetime.fromisoformat(parts[1])
        cursor_id = int(parts[2])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid cursor value") from exc
    if cursor_dt.tzinfo is not None:
        cursor_dt = cursor_dt.replace(tzinfo=None)
    if cursor_created_at.tzinfo is not None:
        cursor_created_at = cursor_created_at.replace(tzinfo=None)
    return cursor_dt, cursor_created_at, cursor_id

def transfer_delta(kind: str, is_primary: bool, amount: int) -> int:
    if kind == "LIABILITY":
        return amount if is_primary else -amount
    return -amount if is_primary else amount


def get_min_balance(item: Item) -> int:
    if item.type_code == "bank_card" and item.card_kind == "CREDIT":
        return -(item.credit_limit or 0)
    if item.type_code == "counterparty_settlements":
        return -(2**62)
    # Обязательства (кредиты, займы): допускаем отрицательное сальдо (переплата) при импорте и вводе
    if item.kind == "LIABILITY":
        return -(2**62)
    # Активы: допускаем отрицательное сальдо (по требованию продукта)
    if item.kind == "ASSET":
        return -(2**62)
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
    balance = getattr(item, "current_balance_minor", item.current_value_rub)
    return insufficient_funds_detail(
        amount=amount,
        balance=balance,
        item_name=item.name,
        tx_date=tx_date,
    )


def _apply_position_delta(item: Item, delta_lots: int, tx_date) -> None:
    if delta_lots == 0:
        return
    current = item.position_lots or 0
    next_value = current + delta_lots
    if next_value < 0:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient lots for item '{item.name}' on {format_tx_datetime(tx_date)}.",
        )
    item.position_lots = next_value


def _apply_quantity_units_delta(item: Item, delta_units: float, tx_date) -> None:
    if delta_units == 0:
        return
    current = float(item.quantity_units or 0)
    next_value = current + delta_units
    if next_value < 0:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient quantity for item '{item.name}' on {format_tx_datetime(tx_date)}.",
        )
    item.quantity_units = next_value


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
        .order_by(
            Transaction.transaction_date.desc(),
            Transaction.created_at.desc(),
            Transaction.id.desc(),
        )
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
    related_item_ids: list[int] | None = Query(default=None),
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
    if related_item_ids:
        stmt = stmt.where(Transaction.related_item_id.in_(related_item_ids))
    if min_amount is not None or max_amount is not None:
        abs_amount = func.abs(Transaction.amount_primary_minor)
        if min_amount is not None:
            stmt = stmt.where(abs_amount >= min_amount)
        if max_amount is not None:
            stmt = stmt.where(abs_amount <= max_amount)
    if cursor:
        cursor_dt, cursor_created_at, cursor_id = _parse_cursor(cursor)
        if cursor_created_at is not None:
            # next page = rows after last in order (transaction_date desc, created_at desc, id desc)
            stmt = stmt.where(
                or_(
                    Transaction.transaction_date < cursor_dt,
                    and_(
                        Transaction.transaction_date == cursor_dt,
                        Transaction.created_at < cursor_created_at,
                    ),
                    and_(
                        Transaction.transaction_date == cursor_dt,
                        Transaction.created_at == cursor_created_at,
                        Transaction.id < cursor_id,
                    ),
                )
            )
        else:
            # backward compatibility: old cursor format "date|id"
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
        .order_by(
            Transaction.transaction_date.desc(),
            Transaction.created_at.desc(),
            Transaction.id.desc(),
        )
        .limit(limit + 1)
    )
    rows = list(db.execute(stmt).scalars())
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]
    next_cursor = None
    if rows:
        last = rows[-1]
        next_cursor = f"{last.transaction_date.isoformat()}|{last.created_at.isoformat()}|{last.id}"

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
        .order_by(
            Transaction.transaction_date.desc(),
            Transaction.created_at.desc(),
            Transaction.id.desc(),
        )
        .all()
    )


@router.post("", response_model=TransactionOut)
def create_transaction(
    data: TransactionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _create_transaction_impl(db, user, data)


@router.post("/debts", response_model=TransactionOut)
def create_debts_transaction(
    data: TransactionDebtsCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.accounting_start_date:
        raise HTTPException(
            status_code=400,
            detail="Дата начала учёта не задана.",
        )
    resolve_counterparty(db, user, data.counterparty_id)

    primary_item = _load_item(db, user, data.primary_item_id, True, "primary")
    if primary_item.type_code == COUNTERPARTY_SETTLEMENTS_TYPE:
        raise HTTPException(
            status_code=400,
            detail="Выберите обычный актив/обязательство, а не «Взаиморасчёты».",
        )
    if is_moex_item(primary_item):
        raise HTTPException(
            status_code=400,
            detail="Операция «Долги» не поддерживается для MOEX инструментов.",
        )

    has_item_id = data.counterparty_settlements_item_id is not None
    has_new_name = data.new_settlement_name is not None and (data.new_settlement_name or "").strip()
    if has_item_id and has_new_name:
        raise HTTPException(
            status_code=400,
            detail="Укажите либо существующий долг (counterparty_settlements_item_id), либо название нового (new_settlement_name), но не оба.",
        )
    if not has_item_id and not has_new_name:
        raise HTTPException(
            status_code=400,
            detail="Укажите существующий долг по контрагенту или создайте новый (название).",
        )

    tx_date = data.transaction_date.date()
    accounting_start = user.accounting_start_date
    open_date = max(accounting_start, tx_date) if accounting_start else tx_date

    if has_item_id:
        settlements_item = _load_item(db, user, data.counterparty_settlements_item_id, True, "counterparty_settlements")
        if (
            settlements_item.type_code != COUNTERPARTY_SETTLEMENTS_TYPE
            or settlements_item.counterparty_id != data.counterparty_id
            or settlements_item.archived_at is not None
        ):
            raise HTTPException(
                status_code=400,
                detail="Выбранный элемент не является активом взаиморасчётов по этому контрагенту или архивован.",
            )
    else:
        settlements_item = create_counterparty_settlements_item(
            db=db,
            user=user,
            counterparty_id=data.counterparty_id,
            currency_code=primary_item.currency_code,
            open_date=open_date,
            accounting_start_date=accounting_start,
            name=(data.new_settlement_name or "").strip(),
        )

    if data.debt_direction == "I_PAID":
        primary_item_id = primary_item.id
        counterparty_item_id = settlements_item.id
    else:
        primary_item_id = settlements_item.id
        counterparty_item_id = primary_item.id

    tx_counterparty_id = data.transaction_counterparty_id if data.transaction_counterparty_id is not None else data.counterparty_id
    if data.transaction_counterparty_id is not None:
        resolve_counterparty(db, user, data.transaction_counterparty_id)

    payload = TransactionCreate(
        transaction_date=data.transaction_date,
        primary_item_id=primary_item_id,
        counterparty_item_id=counterparty_item_id,
        counterparty_id=tx_counterparty_id,
        amount_primary_minor=data.amount_primary_minor,
        amount_counterparty=data.amount_counterparty,
        primary_quantity_lots=None,
        counterparty_quantity_lots=None,
        direction="TRANSFER",
        transaction_type=data.transaction_type,
        category_id=None,
        comment=data.comment,
        status=data.status,
        parent_transaction_id=data.parent_transaction_id,
    )
    return _create_transaction_impl(db, user, payload)


@router.post("/they-paid-for-me", response_model=TransactionOut)
def create_they_paid_for_me_transaction(
    data: TransactionTheyPaidForMeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """«Кто-то заплатил за меня» — expense from Взаиморасчёты (who paid) with counterparty (where paid)."""
    if not user.accounting_start_date:
        raise HTTPException(
            status_code=400,
            detail="Дата начала учёта не задана.",
        )
    if data.who_paid_counterparty_id == data.where_paid_counterparty_id:
        raise HTTPException(
            status_code=400,
            detail="Кто заплатил и Где заплатил должны различаться.",
        )
    resolve_counterparty(db, user, data.who_paid_counterparty_id)
    resolve_counterparty(db, user, data.where_paid_counterparty_id)

    has_item_id = data.counterparty_settlements_item_id is not None
    has_new_name = data.new_settlement_name is not None and (data.new_settlement_name or "").strip()
    if has_item_id and has_new_name:
        raise HTTPException(
            status_code=400,
            detail="Укажите либо существующий долг (counterparty_settlements_item_id), либо название нового (new_settlement_name), но не оба.",
        )
    if not has_item_id and not has_new_name:
        raise HTTPException(
            status_code=400,
            detail="Укажите существующий долг по контрагенту «Кто платит» или создайте новый (название).",
        )

    accounting_start = user.accounting_start_date
    tx_date = data.transaction_date.date() if data.transaction_date else date.today()
    open_date = max(accounting_start, tx_date)

    if has_item_id:
        settlements_item = _load_item(db, user, data.counterparty_settlements_item_id, True, "counterparty_settlements")
        if (
            settlements_item.type_code != COUNTERPARTY_SETTLEMENTS_TYPE
            or settlements_item.counterparty_id != data.who_paid_counterparty_id
            or settlements_item.archived_at is not None
        ):
            raise HTTPException(
                status_code=400,
                detail="Выбранный элемент не является активом взаиморасчётов по контрагенту «Кто платит» или архивован.",
            )
    else:
        settlements_item = create_counterparty_settlements_item(
            db=db,
            user=user,
            counterparty_id=data.who_paid_counterparty_id,
            currency_code="RUB",
            open_date=open_date,
            accounting_start_date=accounting_start,
            name=(data.new_settlement_name or "").strip(),
        )

    category_id = data.category_id
    if category_id is None:
        default_cat = (
            db.query(Category)
            .filter(
                Category.archived_at.is_(None),
                or_(Category.owner_user_id.is_(None), Category.owner_user_id == user.id),
                or_(Category.scope == "EXPENSE", Category.scope == "BOTH"),
            )
            .first()
        )
        if not default_cat:
            raise HTTPException(
                status_code=400,
                detail="Нет доступной категории расхода. Создайте категорию или укажите категорию.",
            )
        category_id = default_cat.id
    category = resolve_category_or_400(db, user, category_id)
    if not category:
        raise HTTPException(status_code=400, detail="Invalid category_id")

    transaction_date = datetime.combine(tx_date, time(0, 0, 0), tzinfo=timezone.utc)

    payload = TransactionCreate(
        transaction_date=transaction_date,
        primary_item_id=settlements_item.id,
        counterparty_item_id=None,
        counterparty_id=data.where_paid_counterparty_id,
        amount_primary_minor=data.amount_primary_minor,
        amount_counterparty=None,
        primary_quantity_lots=None,
        counterparty_quantity_lots=None,
        direction="EXPENSE",
        transaction_type="ACTUAL",
        category_id=category.id,
        comment=data.comment,
        status=None,
    )
    tx = _create_transaction_impl(db, user, payload)
    update_settlements_item_closed_status(db, settlements_item)
    return tx


def _create_transaction_impl(db: Session, user: User, data: TransactionCreate) -> Transaction:
    if data.parent_transaction_id is not None:
        parent = (
            db.query(Transaction)
            .filter(
                Transaction.id == data.parent_transaction_id,
                Transaction.user_id == user.id,
                Transaction.deleted_at.is_(None),
                Transaction.is_split_parent.is_(True),
            )
            .first()
        )
        if not parent:
            raise HTTPException(
                status_code=400,
                detail="Invalid parent_transaction_id: parent must exist, belong to user, not be deleted, and be a split parent.",
            )

    primary_side = _resolve_effective_side(db, user, data.primary_item_id, True, "primary")
    primary = primary_side.effective_item
    primary_is_moex = is_moex_item(primary)

    tx_date = data.transaction_date.date()
    if tx_date < primary_side.start_date:
        if primary_side.selected_item.type_code == COUNTERPARTY_SETTLEMENTS_TYPE:
            primary_side.selected_item.open_date = tx_date
        else:
            raise HTTPException(
                status_code=400,
                detail="Дата транзакции не может быть раньше даты начала действия актива/обязательства.",
            )

    resolve_counterparty(db, user, data.counterparty_id)

    related_item = (
        _load_item(db, user, data.related_item_id, True, "related_item")
        if data.related_item_id is not None
        else None
    )
    related_is_moex = is_moex_item(related_item) if related_item else False
    primary_is_crypto = is_crypto_item(primary)
    related_is_crypto = is_crypto_item(related_item) if related_item else False

    needs_primary_quantity = (
        data.direction in ("INCOME", "EXPENSE")
        and data.asset_link_type in ("ASSET_PURCHASE", "ASSET_SALE")
    )
    if primary_is_moex and needs_primary_quantity and data.primary_quantity_lots is None:
        raise HTTPException(
            status_code=400,
            detail="primary_quantity_lots is required for MOEX items",
        )
    if primary_is_crypto and needs_primary_quantity and data.primary_quantity_units is None:
        raise HTTPException(
            status_code=400,
            detail="primary_quantity_units is required for crypto items",
        )
    if not primary_is_moex and data.primary_quantity_lots is not None and not related_is_moex:
        raise HTTPException(
            status_code=400,
            detail="primary_quantity_lots is only allowed for MOEX items",
        )
    if not primary_is_crypto and data.primary_quantity_units is not None and not related_is_crypto:
        raise HTTPException(
            status_code=400,
            detail="primary_quantity_units is only allowed for crypto items",
        )

    counter_side = None
    counter = None
    amount_counterparty = None
    counter_is_moex = False

    if data.direction == "TRANSFER":
        if data.counterparty_id is not None:
            raise HTTPException(
                status_code=400,
                detail="counterparty_id is not allowed for TRANSFER",
            )
        if data.related_item_id is not None:
            raise HTTPException(
                status_code=400,
                detail="related_item_id is not allowed for TRANSFER",
            )
        if not data.counterparty_item_id:
            raise HTTPException(
                status_code=400,
                detail="counterparty_item_id is required for TRANSFER",
            )

        counter_side = _resolve_effective_side(
            db, user, data.counterparty_item_id, True, "counterparty"
        )
        counter = counter_side.effective_item
        counter_is_moex = is_moex_item(counter)
        if counter_is_moex and data.counterparty_quantity_lots is None:
            raise HTTPException(
                status_code=400,
                detail="counterparty_quantity_lots is required for MOEX items",
            )
        if not counter_is_moex and data.counterparty_quantity_lots is not None:
            raise HTTPException(
                status_code=400,
                detail="counterparty_quantity_lots is only allowed for MOEX items",
            )

        if counter_side.selected_item.id == primary_side.selected_item.id:
            raise HTTPException(status_code=400, detail="Transfer items must be different")
        if counter.id == primary.id:
            raise HTTPException(status_code=400, detail="Transfer items must be different")

        if tx_date < counter_side.start_date:
            if counter_side.selected_item.type_code == COUNTERPARTY_SETTLEMENTS_TYPE:
                counter_side.selected_item.open_date = tx_date
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Дата транзакции не может быть раньше даты начала действия корреспондирующего актива/обязательства.",
                )

        if not primary_is_moex and not counter_is_moex:
            if primary.currency_code != counter.currency_code:
                if data.amount_counterparty is None:
                    raise HTTPException(
                        status_code=400,
                        detail="amount_counterparty is required for cross-currency transfer",
                    )
                amount_counterparty = data.amount_counterparty
            else:
                if data.amount_counterparty is None:
                    amount_counterparty = data.amount_primary_minor
                elif data.amount_counterparty != data.amount_primary_minor:
                    raise HTTPException(
                        status_code=400,
                        detail="amount_counterparty must match amount_rub for same-currency transfer",
                    )
                else:
                    amount_counterparty = data.amount_counterparty
        else:
            amount_counterparty = data.amount_counterparty
    else:
        if data.counterparty_item_id is not None:
            raise HTTPException(
                status_code=400,
                detail="counterparty_item_id is only allowed for TRANSFER",
            )
        if data.counterparty_quantity_lots is not None:
            raise HTTPException(
                status_code=400,
                detail="counterparty_quantity_lots is only allowed for TRANSFER",
            )

    status_value = data.status or "CONFIRMED"

    category_id = data.category_id
    category = resolve_category_or_none(db, user, category_id)
    if category is None and data.direction in ("INCOME", "EXPENSE"):
        # category_id was not provided or not found (e.g. import from another DB) — use default
        scope_filter = "INCOME" if data.direction == "INCOME" else "EXPENSE"
        default_cat = (
            db.query(Category)
            .filter(
                Category.archived_at.is_(None),
                or_(Category.owner_user_id.is_(None), Category.owner_user_id == user.id),
                or_(Category.scope == scope_filter, Category.scope == "BOTH"),
            )
            .first()
        )
        if default_cat:
            category_id = default_cat.id
            category = resolve_category_or_400(db, user, category_id)
        else:
            raise HTTPException(
                status_code=400,
                detail="Нет доступной категории. Создайте категорию или укажите category_id.",
            )

    tx = Transaction(
        user_id=user.id,
        transaction_date=data.transaction_date,
        primary_item_id=primary.id,
        primary_card_item_id=primary_side.card_item.id if primary_side.card_item else None,
        counterparty_item_id=counter.id if counter_side else None,
        counterparty_card_item_id=(
            counter_side.card_item.id if counter_side and counter_side.card_item else None
        ),
        counterparty_id=None if data.direction == "TRANSFER" else data.counterparty_id,
        amount_primary_minor=data.amount_primary_minor,
        amount_counterparty=amount_counterparty,
        primary_quantity_lots=data.primary_quantity_lots,
        counterparty_quantity_lots=data.counterparty_quantity_lots,
        primary_quantity_units=data.primary_quantity_units,
        counterparty_quantity_units=(
            data.counterparty_quantity_units if data.direction == "TRANSFER" else None
        ),
        direction=data.direction,
        transaction_type=data.transaction_type,
        status=status_value,
        category_id=category.id if category else None,
        comment=data.comment,
        related_item_id=None if data.direction == "TRANSFER" else data.related_item_id,
        asset_link_type=data.asset_link_type,
        parent_transaction_id=data.parent_transaction_id,
        is_split_parent=data.is_split_parent,
    )

    if data.transaction_type == "ACTUAL" and not data.is_split_parent:
        amt = data.amount_primary_minor

        if data.direction == "INCOME":
            if primary_is_moex:
                _apply_position_delta(primary, data.primary_quantity_lots or 0, data.transaction_date)
            elif primary_is_crypto and data.primary_quantity_units is not None:
                _apply_quantity_units_delta(primary, data.primary_quantity_units or 0, data.transaction_date)
            else:
                primary.current_balance_minor += amt
                if (primary.currency_code or "RUB").upper() == "RUB":
                    primary.current_value_rub = primary.current_balance_minor

        elif data.direction == "EXPENSE":
            if primary_is_moex:
                _apply_position_delta(primary, -(data.primary_quantity_lots or 0), data.transaction_date)
            elif primary_is_crypto and data.primary_quantity_units is not None:
                _apply_quantity_units_delta(primary, -(data.primary_quantity_units or 0), data.transaction_date)
            else:
                next_balance = primary.current_balance_minor - amt
                if next_balance < get_min_balance(primary):
                    raise HTTPException(
                        status_code=400,
                        detail=balance_violation_detail(primary, amt, data.transaction_date),
                    )
                primary.current_balance_minor = next_balance
                if (primary.currency_code or "RUB").upper() == "RUB":
                    primary.current_value_rub = primary.current_balance_minor

        elif data.direction == "TRANSFER":
            if not counter:
                raise HTTPException(status_code=400, detail="Counterparty item not found")
            primary_is_settlement = primary.type_code == COUNTERPARTY_SETTLEMENTS_TYPE
            counter_is_settlement = counter.type_code == COUNTERPARTY_SETTLEMENTS_TYPE
            if primary_is_settlement and not counter_is_settlement:
                amt_primary = amount_counterparty if amount_counterparty is not None else amt
                amt_counter = amt
            elif counter_is_settlement and not primary_is_settlement:
                amt_primary = amt
                amt_counter = amount_counterparty if amount_counterparty is not None else amt
            else:
                amt_primary = amt
                amt_counter = amount_counterparty or amt
            if primary_is_moex:
                _apply_position_delta(primary, -(data.primary_quantity_lots or 0), data.transaction_date)
            elif primary_is_crypto and data.primary_quantity_units is not None:
                _apply_quantity_units_delta(primary, -(data.primary_quantity_units or 0), data.transaction_date)
            primary_delta = transfer_delta(primary.kind, True, amt_primary)
            primary_next = primary.current_balance_minor + primary_delta
            if primary_next < get_min_balance(primary):
                raise HTTPException(
                    status_code=400,
                    detail=balance_violation_detail(primary, -primary_delta, data.transaction_date),
                )
            primary.current_balance_minor = primary_next
            if (primary.currency_code or "RUB").upper() == "RUB":
                primary.current_value_rub = primary.current_balance_minor

            if counter_is_moex:
                _apply_position_delta(counter, data.counterparty_quantity_lots or 0, data.transaction_date)
            counter_delta = transfer_delta(counter.kind, False, amt_counter)
            counter_next = counter.current_balance_minor + counter_delta
            if counter_next < get_min_balance(counter):
                raise HTTPException(
                    status_code=400,
                    detail=balance_violation_detail(counter, -counter_delta, data.transaction_date),
                )
            counter.current_balance_minor = counter_next
            if (counter.currency_code or "RUB").upper() == "RUB":
                counter.current_value_rub = counter.current_balance_minor

        if related_item and related_is_moex and data.primary_quantity_lots is not None:
            if data.direction == "EXPENSE":
                _apply_position_delta(related_item, data.primary_quantity_lots or 0, data.transaction_date)
            elif data.direction == "INCOME":
                _apply_position_delta(related_item, -(data.primary_quantity_lots or 0), data.transaction_date)
        if related_item and related_is_crypto and data.primary_quantity_units is not None:
            if data.direction == "EXPENSE":
                _apply_quantity_units_delta(related_item, data.primary_quantity_units or 0, data.transaction_date)
            elif data.direction == "INCOME":
                _apply_quantity_units_delta(related_item, -(data.primary_quantity_units or 0), data.transaction_date)

    if data.direction == "TRANSFER" and counter:
        update_settlements_item_closed_status(db, primary)
        update_settlements_item_closed_status(db, counter)

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
        if not tx.counterparty_item_id and tx.transaction_type != "PLANNED":
            raise HTTPException(status_code=400, detail="Broken transfer transaction")
        if tx.counterparty_item_id:
            old_counter = (
                db.query(Item)
                .filter(Item.id == tx.counterparty_item_id, Item.user_id == user.id)
                .with_for_update()
                .first()
            )
            if not old_counter:
                raise HTTPException(status_code=400, detail="Counterparty item not found")
    old_primary_is_moex = is_moex_item(old_primary)
    old_counter_is_moex = is_moex_item(old_counter) if old_counter else False

    new_primary_side = _resolve_effective_side(
        db, user, data.primary_item_id, True, "primary"
    )
    new_primary = new_primary_side.effective_item
    new_primary_is_moex = is_moex_item(new_primary)
    new_primary_is_crypto = is_crypto_item(new_primary)
    needs_primary_quantity = (
        data.direction in ("INCOME", "EXPENSE")
        and data.asset_link_type in ("ASSET_PURCHASE", "ASSET_SALE")
    )
    if new_primary_is_moex and needs_primary_quantity and data.primary_quantity_lots is None:
        raise HTTPException(
            status_code=400,
            detail="primary_quantity_lots is required for MOEX items",
        )
    if new_primary_is_crypto and needs_primary_quantity and data.primary_quantity_units is None:
        raise HTTPException(
            status_code=400,
            detail="primary_quantity_units is required for crypto items",
        )
    if not new_primary_is_moex and data.primary_quantity_lots is not None:
        raise HTTPException(
            status_code=400,
            detail="primary_quantity_lots is only allowed for MOEX items",
        )
    if not new_primary_is_crypto and data.primary_quantity_units is not None:
        raise HTTPException(
            status_code=400,
            detail="primary_quantity_units is only allowed for crypto items",
        )

    new_tx_date = data.transaction_date.date()
    if new_tx_date < new_primary_side.start_date:
        if new_primary_side.selected_item.type_code == COUNTERPARTY_SETTLEMENTS_TYPE:
            new_primary_side.selected_item.open_date = new_tx_date
        else:
            raise HTTPException(
                status_code=400,
                detail="Transaction date cannot be earlier than the item's start date.",
            )

    resolve_counterparty(db, user, data.counterparty_id)

    if data.related_item_id is not None:
        _load_item(db, user, data.related_item_id, False, "related_item")

    new_counter_side = None
    new_counter = None
    amount_counterparty = None
    new_counter_is_moex = False

    if data.direction == "TRANSFER":
        if data.counterparty_id is not None:
            raise HTTPException(
                status_code=400,
                detail="counterparty_id is not allowed for TRANSFER",
            )
        if data.related_item_id is not None:
            raise HTTPException(
                status_code=400,
                detail="related_item_id is not allowed for TRANSFER",
            )
        if not data.counterparty_item_id and tx.transaction_type != "PLANNED":
            raise HTTPException(
                status_code=400,
                detail="counterparty_item_id is required for TRANSFER",
            )

        if data.counterparty_item_id:
            new_counter_side = _resolve_effective_side(
                db, user, data.counterparty_item_id, True, "counterparty"
            )
            new_counter = new_counter_side.effective_item
            new_counter_is_moex = is_moex_item(new_counter)
            if new_counter_is_moex and data.counterparty_quantity_lots is None:
                raise HTTPException(
                    status_code=400,
                    detail="counterparty_quantity_lots is required for MOEX items",
                )
            if not new_counter_is_moex and data.counterparty_quantity_lots is not None:
                raise HTTPException(
                    status_code=400,
                    detail="counterparty_quantity_lots is only allowed for MOEX items",
                )

            if new_counter_side.selected_item.id == new_primary_side.selected_item.id:
                raise HTTPException(status_code=400, detail="Transfer items must be different")
            if new_counter.id == new_primary.id:
                raise HTTPException(status_code=400, detail="Transfer items must be different")

            if new_tx_date < new_counter_side.start_date:
                if new_counter_side.selected_item.type_code == COUNTERPARTY_SETTLEMENTS_TYPE:
                    new_counter_side.selected_item.open_date = new_tx_date
                else:
                    raise HTTPException(
                        status_code=400,
                        detail="Transaction date cannot be earlier than the counterparty start date.",
                    )
        else:
            new_counter_is_moex = False

        if not new_primary_is_moex and not new_counter_is_moex and new_counter is not None:
            if new_primary.currency_code != new_counter.currency_code:
                if data.amount_counterparty is None:
                    raise HTTPException(
                        status_code=400,
                        detail="amount_counterparty is required for cross-currency transfer",
                    )
                amount_counterparty = data.amount_counterparty
            else:
                if data.amount_counterparty is None:
                    amount_counterparty = data.amount_primary_minor
                elif data.amount_counterparty != data.amount_primary_minor:
                    raise HTTPException(
                        status_code=400,
                        detail="amount_counterparty must match amount_rub for same-currency transfer",
                    )
                else:
                    amount_counterparty = data.amount_counterparty
        else:
            amount_counterparty = data.amount_counterparty
    else:
        if data.counterparty_item_id is not None:
            raise HTTPException(
                status_code=400,
                detail="counterparty_item_id is only allowed for TRANSFER",
            )
        if data.counterparty_quantity_lots is not None:
            raise HTTPException(
                status_code=400,
                detail="counterparty_quantity_lots is only allowed for TRANSFER",
            )

    old_primary_is_crypto = is_crypto_item(old_primary)
    old_counter_is_crypto = is_crypto_item(old_counter) if old_counter else False

    deltas: dict[int, int] = {}
    lot_deltas: dict[int, int] = {}
    units_deltas: dict[int, float] = {}

    def add_delta(item_id: int, delta: int) -> None:
        if delta == 0:
            return
        deltas[item_id] = deltas.get(item_id, 0) + delta

    def add_lot_delta(item_id: int, delta: int) -> None:
        if delta == 0:
            return
        lot_deltas[item_id] = lot_deltas.get(item_id, 0) + delta

    def add_units_delta(item_id: int, delta: float) -> None:
        if delta == 0:
            return
        units_deltas[item_id] = units_deltas.get(item_id, 0.0) + delta

    if tx.transaction_type == "ACTUAL":
        old_amt = tx.amount_primary_minor
        old_counter_amt = (
            tx.amount_counterparty if tx.amount_counterparty is not None else old_amt
        )

        if tx.direction == "INCOME":
            if old_primary_is_moex:
                add_lot_delta(old_primary.id, -(tx.primary_quantity_lots or 0))
            elif old_primary_is_crypto and tx.primary_quantity_units is not None:
                add_units_delta(old_primary.id, -(float(tx.primary_quantity_units or 0)))
            else:
                add_delta(old_primary.id, -old_amt)
        elif tx.direction == "EXPENSE":
            if old_primary_is_moex:
                add_lot_delta(old_primary.id, tx.primary_quantity_lots or 0)
            elif old_primary_is_crypto and tx.primary_quantity_units is not None:
                add_units_delta(old_primary.id, float(tx.primary_quantity_units or 0))
            else:
                add_delta(old_primary.id, old_amt)
        elif tx.direction == "TRANSFER":
            if not old_counter:
                raise HTTPException(status_code=400, detail="Counterparty item not found")
            # Revert: subtract what was applied (same swap as create/rollback)
            old_primary_is_settlement = old_primary.type_code == COUNTERPARTY_SETTLEMENTS_TYPE
            old_counter_is_settlement = old_counter.type_code == COUNTERPARTY_SETTLEMENTS_TYPE
            if old_primary_is_settlement and not old_counter_is_settlement:
                old_amt_primary = old_counter_amt
                old_amt_counter = old_amt
            elif old_counter_is_settlement and not old_primary_is_settlement:
                old_amt_primary = old_amt
                old_amt_counter = old_counter_amt
            else:
                old_amt_primary = old_amt
                old_amt_counter = old_counter_amt
            if old_primary_is_moex:
                add_lot_delta(old_primary.id, tx.primary_quantity_lots or 0)
            elif old_primary_is_crypto and tx.primary_quantity_units is not None:
                add_units_delta(old_primary.id, float(tx.primary_quantity_units or 0))
            old_primary_delta = transfer_delta(old_primary.kind, True, old_amt_primary)
            add_delta(old_primary.id, -old_primary_delta)
            if old_counter_is_moex:
                add_lot_delta(old_counter.id, -(tx.counterparty_quantity_lots or 0))
            old_counter_delta = transfer_delta(old_counter.kind, False, old_amt_counter)
            add_delta(old_counter.id, -old_counter_delta)

    if data.transaction_type == "ACTUAL":
        new_amt = data.amount_primary_minor
        new_counter_amt = (
            amount_counterparty if amount_counterparty is not None else new_amt
        )

        if data.direction == "INCOME":
            if new_primary_is_moex:
                add_lot_delta(new_primary.id, data.primary_quantity_lots or 0)
            elif new_primary_is_crypto and data.primary_quantity_units is not None:
                add_units_delta(new_primary.id, float(data.primary_quantity_units or 0))
            else:
                add_delta(new_primary.id, new_amt)
        elif data.direction == "EXPENSE":
            if new_primary_is_moex:
                add_lot_delta(new_primary.id, -(data.primary_quantity_lots or 0))
            elif new_primary_is_crypto and data.primary_quantity_units is not None:
                add_units_delta(new_primary.id, -float(data.primary_quantity_units or 0))
            else:
                add_delta(new_primary.id, -new_amt)
        elif data.direction == "TRANSFER":
            if not new_counter:
                raise HTTPException(status_code=400, detail="Counterparty item not found")
            new_primary_is_settlement = new_primary.type_code == COUNTERPARTY_SETTLEMENTS_TYPE
            new_counter_is_settlement = new_counter.type_code == COUNTERPARTY_SETTLEMENTS_TYPE
            if new_primary_is_settlement and not new_counter_is_settlement:
                new_amt_primary = amount_counterparty if amount_counterparty is not None else new_amt
                new_amt_counter = new_amt
            elif new_counter_is_settlement and not new_primary_is_settlement:
                new_amt_primary = new_amt
                new_amt_counter = amount_counterparty if amount_counterparty is not None else new_amt
            else:
                new_amt_primary = new_amt
                new_amt_counter = new_counter_amt
            if new_primary_is_moex:
                add_lot_delta(new_primary.id, -(data.primary_quantity_lots or 0))
            elif new_primary_is_crypto and data.primary_quantity_units is not None:
                add_units_delta(new_primary.id, -float(data.primary_quantity_units or 0))
            new_primary_delta = transfer_delta(new_primary.kind, True, new_amt_primary)
            add_delta(new_primary.id, new_primary_delta)
            if new_counter_is_moex:
                add_lot_delta(new_counter.id, data.counterparty_quantity_lots or 0)
            new_counter_delta = transfer_delta(new_counter.kind, False, new_amt_counter)
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
        balance = getattr(item, "current_balance_minor", item.current_value_rub)
        if balance + delta < min_balance:
            detail = "Cannot update: would make balance negative. Update later transactions first."
            if min_balance < 0:
                detail = "Cannot update: would exceed credit limit. Update later transactions first."
            raise HTTPException(
                status_code=409,
                detail=detail,
            )

    for item_id, delta in lot_deltas.items():
        item = items_by_id.get(item_id)
        if not item:
            raise HTTPException(status_code=400, detail="Item not found")
        current = item.position_lots or 0
        if current + delta < 0:
            raise HTTPException(
                status_code=409,
                detail="Cannot update: would make position negative. Update later transactions first.",
            )

    for item_id, delta in units_deltas.items():
        item = items_by_id.get(item_id)
        if not item:
            raise HTTPException(status_code=400, detail="Item not found")
        current = float(item.quantity_units or 0)
        if current + delta < 0:
            raise HTTPException(
                status_code=409,
                detail="Cannot update: would make quantity negative. Update later transactions first.",
            )

    for item_id, delta in deltas.items():
        it = items_by_id[item_id]
        it.current_balance_minor += delta
        if (it.currency_code or "RUB").upper() == "RUB":
            it.current_value_rub = it.current_balance_minor

    for item_id, delta in lot_deltas.items():
        item = items_by_id[item_id]
        item.position_lots = (item.position_lots or 0) + delta

    for item_id, delta in units_deltas.items():
        item = items_by_id[item_id]
        item.quantity_units = float(item.quantity_units or 0) + delta

    category = resolve_category_or_400(db, user, data.category_id)

    tx.transaction_date = data.transaction_date
    tx.primary_item_id = new_primary.id
    tx.primary_card_item_id = (
        new_primary_side.card_item.id if new_primary_side.card_item else None
    )
    tx.counterparty_item_id = (
        (new_counter.id if new_counter else None) if data.direction == "TRANSFER" else None
    )
    tx.counterparty_card_item_id = (
        (
            new_counter_side.card_item.id
            if new_counter_side and new_counter_side.card_item
            else None
        )
        if data.direction == "TRANSFER"
        else None
    )
    tx.counterparty_id = None if data.direction == "TRANSFER" else data.counterparty_id
    tx.amount_primary_minor = data.amount_primary_minor
    tx.amount_counterparty = amount_counterparty if data.direction == "TRANSFER" else None
    if data.primary_quantity_lots is not None or tx.asset_link_type not in ("ASSET_PURCHASE", "ASSET_SALE"):
        tx.primary_quantity_lots = data.primary_quantity_lots
    if data.primary_quantity_units is not None or tx.asset_link_type not in ("ASSET_PURCHASE", "ASSET_SALE"):
        tx.primary_quantity_units = data.primary_quantity_units
    tx.counterparty_quantity_lots = data.counterparty_quantity_lots if data.direction == "TRANSFER" else None
    tx.counterparty_quantity_units = data.counterparty_quantity_units if data.direction == "TRANSFER" else None
    tx.direction = data.direction
    tx.transaction_type = data.transaction_type
    if data.status is not None:
        tx.status = data.status
    tx.category_id = category.id if category else None
    tx.comment = data.comment
    tx.related_item_id = None if data.direction == "TRANSFER" else data.related_item_id
    tx.asset_link_type = data.asset_link_type
    if data.parent_transaction_id is not None:
        tx.parent_transaction_id = data.parent_transaction_id

    for item in items_by_id.values():
        if item and item.type_code == COUNTERPARTY_SETTLEMENTS_TYPE:
            update_settlements_item_closed_status(db, item)

    db.commit()
    db.refresh(tx)
    return tx


def _rollback_transaction_balance(db: Session, user: User, tx: Transaction) -> None:
    """Reverse the balance impact of an ACTUAL transaction (without setting deleted_at)."""
    if tx.transaction_type != "ACTUAL":
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
    if tx.direction == "TRANSFER" and tx.counterparty_item_id:
        counter = (
            db.query(Item)
            .filter(Item.id == tx.counterparty_item_id, Item.user_id == user.id)
            .with_for_update()
            .first()
        )
        if not counter:
            raise HTTPException(status_code=400, detail="Counterparty item not found")
    primary_is_moex = is_moex_item(primary)
    counter_is_moex = is_moex_item(counter) if counter else False
    primary_is_crypto = is_crypto_item(primary)
    counter_is_crypto = is_crypto_item(counter) if counter else False

    amt = tx.amount_primary_minor
    amt_counterparty = tx.amount_counterparty or amt

    if tx.direction == "INCOME":
        if primary_is_moex:
            _apply_position_delta(primary, -(tx.primary_quantity_lots or 0), tx.transaction_date)
        elif primary_is_crypto and tx.primary_quantity_units is not None:
            _apply_quantity_units_delta(primary, -(float(tx.primary_quantity_units or 0)), tx.transaction_date)
        else:
            primary.current_balance_minor -= amt
            if (primary.currency_code or "RUB").upper() == "RUB":
                primary.current_value_rub = primary.current_balance_minor
    elif tx.direction == "EXPENSE":
        if primary_is_moex:
            _apply_position_delta(primary, tx.primary_quantity_lots or 0, tx.transaction_date)
        elif primary_is_crypto and tx.primary_quantity_units is not None:
            _apply_quantity_units_delta(primary, float(tx.primary_quantity_units or 0), tx.transaction_date)
        else:
            primary.current_balance_minor += amt
            if (primary.currency_code or "RUB").upper() == "RUB":
                primary.current_value_rub = primary.current_balance_minor
    elif tx.direction == "TRANSFER" and counter:
        primary_is_settlement = primary.type_code == COUNTERPARTY_SETTLEMENTS_TYPE
        counter_is_settlement = counter.type_code == COUNTERPARTY_SETTLEMENTS_TYPE
        if primary_is_settlement and not counter_is_settlement:
            amt_primary = amt_counterparty
            amt_counter = amt
        elif counter_is_settlement and not primary_is_settlement:
            amt_primary = amt
            amt_counter = amt_counterparty
        else:
            amt_primary = amt
            amt_counter = amt_counterparty
        if primary_is_moex:
            _apply_position_delta(primary, tx.primary_quantity_lots or 0, tx.transaction_date)
        elif primary_is_crypto and tx.primary_quantity_units is not None:
            _apply_quantity_units_delta(primary, float(tx.primary_quantity_units or 0), tx.transaction_date)
        else:
            primary_delta = -transfer_delta(primary.kind, True, amt_primary)
            primary.current_balance_minor += primary_delta
            if (primary.currency_code or "RUB").upper() == "RUB":
                primary.current_value_rub = primary.current_balance_minor
        if counter_is_moex:
            _apply_position_delta(counter, -(tx.counterparty_quantity_lots or 0), tx.transaction_date)
        else:
            counter_delta = -transfer_delta(counter.kind, False, amt_counter)
            counter.current_balance_minor += counter_delta
            if (counter.currency_code or "RUB").upper() == "RUB":
                counter.current_value_rub = counter.current_balance_minor

    if tx.related_item_id:
        related_item = db.query(Item).filter(Item.id == tx.related_item_id, Item.user_id == user.id).with_for_update().first()
        if related_item and tx.primary_quantity_lots is not None and is_moex_item(related_item):
            if tx.direction == "EXPENSE":
                _apply_position_delta(related_item, -(tx.primary_quantity_lots or 0), tx.transaction_date)
            elif tx.direction == "INCOME":
                _apply_position_delta(related_item, tx.primary_quantity_lots or 0, tx.transaction_date)
        if related_item and tx.primary_quantity_units is not None and is_crypto_item(related_item):
            if tx.direction == "EXPENSE":
                _apply_quantity_units_delta(related_item, -(float(tx.primary_quantity_units or 0)), tx.transaction_date)
            elif tx.direction == "INCOME":
                _apply_quantity_units_delta(related_item, float(tx.primary_quantity_units or 0), tx.transaction_date)

    update_settlements_item_closed_status(db, primary)
    if counter:
        update_settlements_item_closed_status(db, counter)


def _apply_transaction_balance(db: Session, user: User, tx: Transaction) -> None:
    """Apply the balance impact of an ACTUAL transaction (tx already has all fields set)."""
    if tx.transaction_type != "ACTUAL":
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
    if tx.direction == "TRANSFER" and tx.counterparty_item_id:
        counter = (
            db.query(Item)
            .filter(Item.id == tx.counterparty_item_id, Item.user_id == user.id)
            .with_for_update()
            .first()
        )
        if not counter:
            raise HTTPException(status_code=400, detail="Counterparty item not found")
    primary_is_moex = is_moex_item(primary)
    counter_is_moex = is_moex_item(counter) if counter else False
    primary_is_crypto = is_crypto_item(primary)
    counter_is_crypto = is_crypto_item(counter) if counter else False

    amt = tx.amount_primary_minor
    amt_counterparty = tx.amount_counterparty or amt

    if tx.direction == "INCOME":
        if primary_is_moex:
            _apply_position_delta(primary, tx.primary_quantity_lots or 0, tx.transaction_date)
        elif primary_is_crypto and tx.primary_quantity_units is not None:
            _apply_quantity_units_delta(primary, float(tx.primary_quantity_units or 0), tx.transaction_date)
        else:
            primary.current_balance_minor += amt
            if (primary.currency_code or "RUB").upper() == "RUB":
                primary.current_value_rub = primary.current_balance_minor
    elif tx.direction == "EXPENSE":
        if primary_is_moex:
            _apply_position_delta(primary, -(tx.primary_quantity_lots or 0), tx.transaction_date)
        elif primary_is_crypto and tx.primary_quantity_units is not None:
            _apply_quantity_units_delta(primary, -float(tx.primary_quantity_units or 0), tx.transaction_date)
        else:
            next_balance = primary.current_balance_minor - amt
            if next_balance < get_min_balance(primary):
                raise HTTPException(
                    status_code=400,
                    detail=balance_violation_detail(primary, amt, tx.transaction_date),
                )
            primary.current_balance_minor = next_balance
            if (primary.currency_code or "RUB").upper() == "RUB":
                primary.current_value_rub = primary.current_balance_minor
    elif tx.direction == "TRANSFER" and counter:
        primary_is_settlement = primary.type_code == COUNTERPARTY_SETTLEMENTS_TYPE
        counter_is_settlement = counter.type_code == COUNTERPARTY_SETTLEMENTS_TYPE
        if primary_is_settlement and not counter_is_settlement:
            amt_primary = amt_counterparty
            amt_counter = amt
        elif counter_is_settlement and not primary_is_settlement:
            amt_primary = amt
            amt_counter = amt_counterparty
        else:
            amt_primary = amt
            amt_counter = amt_counterparty
        if primary_is_moex:
            _apply_position_delta(primary, -(tx.primary_quantity_lots or 0), tx.transaction_date)
        elif primary_is_crypto and tx.primary_quantity_units is not None:
            _apply_quantity_units_delta(primary, -(float(tx.primary_quantity_units or 0)), tx.transaction_date)
        else:
            primary_delta = transfer_delta(primary.kind, True, amt_primary)
            primary.current_balance_minor += primary_delta
            if (primary.currency_code or "RUB").upper() == "RUB":
                primary.current_value_rub = primary.current_balance_minor
        if counter_is_moex:
            _apply_position_delta(counter, tx.counterparty_quantity_lots or 0, tx.transaction_date)
        else:
            counter_delta = transfer_delta(counter.kind, False, amt_counter)
            counter.current_balance_minor += counter_delta
            if (counter.currency_code or "RUB").upper() == "RUB":
                counter.current_value_rub = counter.current_balance_minor

    if tx.related_item_id:
        related_item = db.query(Item).filter(Item.id == tx.related_item_id, Item.user_id == user.id).with_for_update().first()
        if related_item and tx.primary_quantity_lots is not None and is_moex_item(related_item):
            if tx.direction == "EXPENSE":
                _apply_position_delta(related_item, tx.primary_quantity_lots or 0, tx.transaction_date)
            elif tx.direction == "INCOME":
                _apply_position_delta(related_item, -(tx.primary_quantity_lots or 0), tx.transaction_date)
        if related_item and tx.primary_quantity_units is not None and is_crypto_item(related_item):
            if tx.direction == "EXPENSE":
                _apply_quantity_units_delta(related_item, float(tx.primary_quantity_units or 0), tx.transaction_date)
            elif tx.direction == "INCOME":
                _apply_quantity_units_delta(related_item, -(float(tx.primary_quantity_units or 0)), tx.transaction_date)

    update_settlements_item_closed_status(db, primary)
    if counter:
        update_settlements_item_closed_status(db, counter)


def _apply_transaction_soft_delete(db: Session, user: User, tx: Transaction) -> None:
    if tx.deleted_at is not None:
        return
    _rollback_transaction_balance(db, user, tx)
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
        .order_by(
            Transaction.transaction_date.desc(),
            Transaction.created_at.desc(),
            Transaction.id.desc(),
        )
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

@router.post("/{tx_id}/split", response_model=TransactionSplitOut)
def split_transaction(
    tx_id: int,
    data: TransactionSplitCreate,
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
        raise HTTPException(status_code=400, detail="Cannot split deleted transaction")
    if tx.transaction_type != "ACTUAL":
        raise HTTPException(status_code=400, detail="Can only split ACTUAL transactions")
    if tx.parent_transaction_id is not None:
        raise HTTPException(status_code=400, detail="Cannot split a transaction that is already a part")

    parts_sum = sum(p.amount_rub for p in data.parts)
    if parts_sum > tx.amount_primary_minor:
        raise HTTPException(
            status_code=400,
            detail="Sum of parts must not exceed the transaction amount",
        )
    if not data.parts:
        raise HTTPException(status_code=400, detail="At least one part is required")

    _rollback_transaction_balance(db, user, tx)
    tx.is_split_parent = True

    parts_out = []
    for part_data in data.parts:
        category = resolve_category_or_none(db, user, part_data.category_id)
        if part_data.category_id is not None and category is None:
            raise HTTPException(status_code=400, detail=f"Invalid category_id {part_data.category_id}")
        if category is None and tx.direction in ("INCOME", "EXPENSE"):
            scope_filter = "INCOME" if tx.direction == "INCOME" else "EXPENSE"
            default_cat = (
                db.query(Category)
                .filter(
                    Category.archived_at.is_(None),
                    or_(Category.owner_user_id.is_(None), Category.owner_user_id == user.id),
                    or_(Category.scope == scope_filter, Category.scope == "BOTH"),
                )
                .first()
            )
            category = default_cat
        cat_id = category.id if category else None

        amount_counterparty_part = None
        if tx.direction == "TRANSFER" and tx.amount_counterparty is not None and tx.amount_primary_minor:
            amount_counterparty_part = int(round(tx.amount_counterparty * part_data.amount_rub / tx.amount_primary_minor))

        part_lots = None
        part_counterparty_lots = None
        part_units = None
        part_counterparty_units = None
        if tx.amount_primary_minor:
            if tx.primary_quantity_lots is not None:
                part_lots = int(round(tx.primary_quantity_lots * part_data.amount_rub / tx.amount_primary_minor))
            if tx.counterparty_quantity_lots is not None:
                part_counterparty_lots = int(round(tx.counterparty_quantity_lots * part_data.amount_rub / tx.amount_primary_minor))
            if tx.primary_quantity_units is not None:
                part_units = round(float(tx.primary_quantity_units) * part_data.amount_rub / tx.amount_primary_minor, 10)
            if tx.counterparty_quantity_units is not None:
                part_counterparty_units = round(float(tx.counterparty_quantity_units) * part_data.amount_rub / tx.amount_primary_minor, 10)

        part_tx = Transaction(
            user_id=user.id,
            transaction_date=tx.transaction_date,
            primary_item_id=tx.primary_item_id,
            primary_card_item_id=tx.primary_card_item_id,
            counterparty_item_id=tx.counterparty_item_id,
            counterparty_card_item_id=tx.counterparty_card_item_id,
            counterparty_id=tx.counterparty_id,
            amount_primary_minor=part_data.amount_rub,
            amount_counterparty=amount_counterparty_part if tx.direction == "TRANSFER" else None,
            primary_quantity_lots=part_lots,
            counterparty_quantity_lots=part_counterparty_lots,
            primary_quantity_units=part_units,
            counterparty_quantity_units=part_counterparty_units,
            direction=tx.direction,
            transaction_type=tx.transaction_type,
            status=tx.status,
            category_id=cat_id,
            comment=tx.comment,
            related_item_id=tx.related_item_id,
            asset_link_type=tx.asset_link_type,
            parent_transaction_id=tx.id,
        )
        db.add(part_tx)
        db.flush()
        _apply_transaction_balance(db, user, part_tx)
        db.refresh(part_tx)
        parts_out.append(part_tx)

    db.commit()
    db.refresh(tx)
    return TransactionSplitOut(parent=tx, parts=parts_out)


def _do_unsplit(db: Session, user: User, parent: Transaction) -> None:
    """Unsplit: rollback all parts, soft-delete them, set parent.is_split_parent=False, apply parent balance."""
    children = (
        db.query(Transaction)
        .filter(
            Transaction.parent_transaction_id == parent.id,
            Transaction.user_id == user.id,
            Transaction.deleted_at.is_(None),
        )
        .with_for_update()
        .all()
    )
    for child in children:
        _rollback_transaction_balance(db, user, child)
        child.deleted_at = datetime.now(timezone.utc)
    parent.is_split_parent = False
    _apply_transaction_balance(db, user, parent)


@router.post("/{tx_id}/unsplit", response_model=TransactionOut)
def unsplit_transaction(
    tx_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    parent = (
        db.query(Transaction)
        .filter(Transaction.id == tx_id, Transaction.user_id == user.id)
        .with_for_update()
        .first()
    )
    if not parent:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if parent.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Cannot unsplit deleted transaction")
    if not parent.is_split_parent:
        raise HTTPException(status_code=400, detail="Transaction is not a split parent")

    children = (
        db.query(Transaction)
        .filter(
            Transaction.parent_transaction_id == parent.id,
            Transaction.deleted_at.is_(None),
        )
        .limit(1)
        .all()
    )
    if not children:
        raise HTTPException(status_code=400, detail="No non-deleted parts to unsplit")

    _do_unsplit(db, user, parent)
    db.commit()
    db.refresh(parent)
    return parent


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

    if tx.is_split_parent:
        children = (
            db.query(Transaction)
            .filter(
                Transaction.parent_transaction_id == tx.id,
                Transaction.user_id == user.id,
                Transaction.deleted_at.is_(None),
            )
            .with_for_update()
            .all()
        )
        for child in children:
            _apply_transaction_soft_delete(db, user, child)
        tx.deleted_at = datetime.now(timezone.utc)
    else:
        parent_id = tx.parent_transaction_id
        _apply_transaction_soft_delete(db, user, tx)
    parent_id = tx.parent_transaction_id
    db.commit()

    if parent_id is not None:
        remaining_parts = (
            db.query(Transaction)
            .filter(
                Transaction.parent_transaction_id == parent_id,
                Transaction.user_id == user.id,
                Transaction.deleted_at.is_(None),
            )
            .count()
        )
        if remaining_parts == 0:
            parent = (
                db.query(Transaction)
                .filter(Transaction.id == parent_id, Transaction.user_id == user.id)
                .with_for_update()
                .first()
            )
            if parent and parent.is_split_parent:
                _do_unsplit(db, user, parent)
                db.commit()

    return {"ok": True}
