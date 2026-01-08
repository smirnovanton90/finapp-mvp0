from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import calendar

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from category_service import resolve_category_or_400
from db import get_db
from models import Item, Transaction, TransactionChain, User, Counterparty
from schemas import TransactionChainCreate, TransactionChainOut

router = APIRouter(prefix="/transaction-chains", tags=["transaction-chains"])


@dataclass(frozen=True)
class ResolvedSide:
    selected_item: Item
    effective_item: Item
    card_item: Item | None
    start_date: date


def _resolve_effective_side(
    db: Session, user: User, item_id: int, role_label: str
) -> ResolvedSide:
    item = (
        db.query(Item)
        .filter(Item.id == item_id, Item.user_id == user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=400, detail=f"Invalid {role_label}_item_id")

    if item.type_code != "bank_card" or not item.card_account_id:
        return ResolvedSide(
            selected_item=item,
            effective_item=item,
            card_item=None,
            start_date=item.start_date,
        )

    account = (
        db.query(Item)
        .filter(Item.id == item.card_account_id, Item.user_id == user.id)
        .first()
    )
    if not account or account.type_code != "bank_account" or account.kind != "ASSET":
        raise HTTPException(status_code=400, detail="Invalid card_account_id")
    if account.currency_code != item.currency_code:
        raise HTTPException(
            status_code=400, detail="Card and account currencies must match"
        )
    if account.bank_id != item.bank_id:
        raise HTTPException(status_code=400, detail="Card and account banks must match")

    start_date = max(item.start_date, account.start_date)
    return ResolvedSide(
        selected_item=item,
        effective_item=account,
        card_item=item,
        start_date=start_date,
    )

def iter_daily(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def iter_weekly(start: date, end: date, weekday: int):
    offset = (weekday - start.weekday()) % 7
    current = start + timedelta(days=offset)
    while current <= end:
        yield current
        current += timedelta(days=7)


def iter_monthly(
    start: date, end: date, monthly_day: int | None, monthly_rule: str | None
):
    current = date(start.year, start.month, 1)
    while current <= end:
        last_day = calendar.monthrange(current.year, current.month)[1]
        if monthly_day is not None:
            day = min(monthly_day, last_day)
            candidate = date(current.year, current.month, day)
        elif monthly_rule == "FIRST_DAY":
            candidate = date(current.year, current.month, 1)
        else:
            candidate = date(current.year, current.month, last_day)

        if start <= candidate <= end:
            yield candidate

        if current.month == 12:
            current = date(current.year + 1, 1, 1)
        else:
            current = date(current.year, current.month + 1, 1)


def iter_regular(start: date, end: date, interval_days: int):
    current = start
    step = timedelta(days=interval_days)
    while current <= end:
        yield current
        current += step


def build_schedule_dates(
    start: date,
    end: date,
    frequency: str,
    weekly_day: int | None,
    monthly_day: int | None,
    monthly_rule: str | None,
    interval_days: int | None,
) -> list[date]:
    if frequency == "DAILY":
        return list(iter_daily(start, end))
    if frequency == "WEEKLY":
        if weekly_day is None:
            return []
        return list(iter_weekly(start, end, weekly_day))
    if frequency == "MONTHLY":
        return list(iter_monthly(start, end, monthly_day, monthly_rule))
    if frequency == "REGULAR":
        if interval_days is None or interval_days < 1:
            return []
        return list(iter_regular(start, end, interval_days))
    return []


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


@router.get("", response_model=list[TransactionChainOut])
def list_transaction_chains(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return (
        db.query(TransactionChain)
        .filter(TransactionChain.user_id == user.id)
        .order_by(TransactionChain.created_at.desc(), TransactionChain.id.desc())
        .all()
    )


@router.post("", response_model=TransactionChainOut)
def create_transaction_chain(
    data: TransactionChainCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    resolve_counterparty(db, user, data.counterparty_id)
    primary_side = _resolve_effective_side(db, user, data.primary_item_id, "primary")
    primary = primary_side.effective_item

    if data.start_date < primary_side.start_date:
        raise HTTPException(
            status_code=400,
            detail="start_date cannot be earlier than the primary item start date",
        )

    counter_side = None
    counter = None
    amount_counterparty = None

    if data.direction == "TRANSFER":
        if not data.counterparty_item_id:
            raise HTTPException(
                status_code=400,
                detail="counterparty_item_id is required for TRANSFER",
            )
        counter_side = _resolve_effective_side(db, user, data.counterparty_item_id, "counterparty")
        counter = counter_side.effective_item
        if counter_side.selected_item.id == primary_side.selected_item.id:
            raise HTTPException(status_code=400, detail="Transfer items must be different")
        if counter.id == primary.id:
            raise HTTPException(status_code=400, detail="Transfer items must be different")
        if data.start_date < counter_side.start_date:
            raise HTTPException(
                status_code=400,
                detail="start_date cannot be earlier than the counterparty start date",
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

    schedule_dates = build_schedule_dates(
        data.start_date,
        data.end_date,
        data.frequency,
        data.weekly_day,
        data.monthly_day,
        data.monthly_rule,
        data.interval_days,
    )
    if not schedule_dates:
        raise HTTPException(status_code=400, detail="No dates generated for chain")

    category = resolve_category_or_400(db, user, data.category_id)

    chain = TransactionChain(
        user_id=user.id,
        name=data.name,
        start_date=data.start_date,
        end_date=data.end_date,
        frequency=data.frequency,
        weekly_day=data.weekly_day,
        monthly_day=data.monthly_day,
        monthly_rule=data.monthly_rule,
        interval_days=data.interval_days,
        primary_item_id=primary.id,
        primary_card_item_id=primary_side.card_item.id if primary_side.card_item else None,
        counterparty_item_id=counter.id if data.direction == "TRANSFER" else None,
        counterparty_card_item_id=(
            counter_side.card_item.id if counter_side and counter_side.card_item else None
        ),
        counterparty_id=data.counterparty_id,
        amount_rub=data.amount_rub,
        amount_counterparty=amount_counterparty if data.direction == "TRANSFER" else None,
        direction=data.direction,
        category_id=category.id if category else None,
        description=data.description,
        comment=data.comment,
    )
    db.add(chain)
    db.flush()

    txs = []
    for tx_date in schedule_dates:
        txs.append(
            Transaction(
                user_id=user.id,
                chain_id=chain.id,
                transaction_date=datetime.combine(tx_date, datetime.min.time()),
                primary_item_id=primary.id,
                primary_card_item_id=primary_side.card_item.id if primary_side.card_item else None,
                counterparty_item_id=counter.id if data.direction == "TRANSFER" else None,
                counterparty_card_item_id=(
                    counter_side.card_item.id if counter_side and counter_side.card_item else None
                ),
                counterparty_id=data.counterparty_id,
                amount_rub=data.amount_rub,
                amount_counterparty=amount_counterparty if data.direction == "TRANSFER" else None,
                direction=data.direction,
                transaction_type="PLANNED",
                status="CONFIRMED",
                category_id=category.id if category else None,
                description=data.description,
                comment=data.comment,
            )
        )

    db.add_all(txs)
    db.commit()
    db.refresh(chain)
    return chain


@router.delete("/{chain_id}")
def delete_transaction_chain(
    chain_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    chain = (
        db.query(TransactionChain)
        .filter(TransactionChain.id == chain_id, TransactionChain.user_id == user.id)
        .with_for_update()
        .first()
    )
    if not chain:
        raise HTTPException(status_code=404, detail="Transaction chain not found")

    if chain.deleted_at is not None:
        return {"ok": True}

    now = datetime.now(timezone.utc)
    chain.deleted_at = now

    (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.chain_id == chain.id,
            Transaction.transaction_type == "PLANNED",
            Transaction.deleted_at.is_(None),
        )
        .update({Transaction.deleted_at: now}, synchronize_session=False)
    )

    db.commit()
    return {"ok": True}
