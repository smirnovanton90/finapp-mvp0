from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException
from sqlalchemy.orm import Session

from category_service import resolve_category_or_400
from models import Category, Item, ItemPlanSettings, Transaction, TransactionChain, User
from schemas import ItemPlanSettingsBase
from transaction_chains import build_schedule_dates

INTEREST_ITEM_TYPES = {"deposit", "savings_account"}
LOAN_ASSET_TYPES = {"loan_to_third_party", "third_party_receivables"}
LOAN_LIABILITY_TYPES = {
    "credit_card_debt",
    "consumer_loan",
    "mortgage",
    "car_loan",
    "education_loan",
    "installment",
    "microloan",
    "private_loan",
    "third_party_payables",
}
LOAN_ITEM_TYPES = LOAN_ASSET_TYPES | LOAN_LIABILITY_TYPES


@dataclass(frozen=True)
class ResolvedPlanSide:
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


def upsert_plan_settings(
    db: Session,
    item: Item,
    payload: ItemPlanSettingsBase | None,
) -> ItemPlanSettings | None:
    if payload is None:
        return item.plan_settings

    settings = item.plan_settings
    if not settings:
        settings = ItemPlanSettings(item_id=item.id)

    settings.enabled = payload.enabled
    settings.first_payout_rule = payload.first_payout_rule
    settings.plan_end_date = payload.plan_end_date
    settings.loan_end_date = payload.loan_end_date
    settings.repayment_frequency = payload.repayment_frequency
    settings.repayment_weekly_day = payload.repayment_weekly_day
    settings.repayment_monthly_day = payload.repayment_monthly_day
    settings.repayment_monthly_rule = payload.repayment_monthly_rule
    settings.repayment_interval_days = payload.repayment_interval_days
    settings.repayment_account_id = payload.repayment_account_id
    settings.repayment_type = payload.repayment_type
    settings.payment_amount_kind = payload.payment_amount_kind
    settings.payment_amount_rub = payload.payment_amount_rub

    db.add(settings)
    return settings


def plan_signature(item: Item, settings: ItemPlanSettings | None) -> tuple | None:
    if not settings or not settings.enabled:
        return None
    if item.type_code in INTEREST_ITEM_TYPES:
        return (
            "INTEREST",
            item.type_code,
            item.currency_code,
            item.initial_value_rub,
            item.open_date,
            item.deposit_term_days,
            item.deposit_end_date,
            item.interest_rate,
            item.interest_payout_order,
            item.interest_capitalization,
            item.interest_payout_account_id,
            settings.first_payout_rule,
            settings.plan_end_date,
        )
    if item.type_code in LOAN_ITEM_TYPES:
        return (
            "LOAN",
            item.type_code,
            item.kind,
            item.currency_code,
            item.initial_value_rub,
            item.open_date,
            item.start_date,
            item.interest_rate,
            settings.loan_end_date,
            settings.plan_end_date,
            settings.first_payout_rule,
            settings.repayment_frequency,
            settings.repayment_weekly_day,
            settings.repayment_monthly_day,
            settings.repayment_monthly_rule,
            settings.repayment_interval_days,
            settings.repayment_account_id,
            settings.repayment_type,
            settings.payment_amount_kind,
            settings.payment_amount_rub,
        )
    return None


def delete_auto_chains(
    db: Session,
    user: User,
    item_id: int,
    keep_realized: bool = True,
) -> None:
    chains = (
        db.query(TransactionChain)
        .filter(
            TransactionChain.user_id == user.id,
            TransactionChain.linked_item_id == item_id,
            TransactionChain.source == "AUTO_ITEM",
            TransactionChain.deleted_at.is_(None),
        )
        .all()
    )
    if not chains:
        return

    now = datetime.now(timezone.utc)
    for chain in chains:
        chain.deleted_at = now

    chain_ids = [chain.id for chain in chains]
    tx_query = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.chain_id.in_(chain_ids),
            Transaction.transaction_type == "PLANNED",
            Transaction.deleted_at.is_(None),
        )
    )
    if keep_realized:
        tx_query = tx_query.filter(Transaction.status != "REALIZED")
    tx_query.update({Transaction.deleted_at: now}, synchronize_session=False)


def rebuild_item_chains(
    db: Session,
    user: User,
    item: Item,
    settings: ItemPlanSettings | None,
) -> None:
    delete_auto_chains(db, user, item.id, keep_realized=True)
    if settings and settings.enabled:
        create_item_chains(db, user, item, settings)


def create_item_chains(
    db: Session,
    user: User,
    item: Item,
    settings: ItemPlanSettings,
) -> None:
    if item.type_code in INTEREST_ITEM_TYPES:
        _create_interest_chain(db, user, item, settings)
        return
    if item.type_code in LOAN_ITEM_TYPES:
        _create_loan_chains(db, user, item, settings)
        return
    raise HTTPException(status_code=400, detail="Auto plans are not supported for this type")


def _resolve_item_for_plan(
    db: Session,
    user: User,
    item_id: int,
    role_label: str,
) -> ResolvedPlanSide:
    item = (
        db.query(Item)
        .filter(Item.id == item_id, Item.user_id == user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=400, detail=f"Invalid {role_label}_item_id")

    if item.type_code != "bank_card" or not item.card_account_id:
        return ResolvedPlanSide(
            selected_item=item,
            effective_item=item,
            card_item=None,
            start_date=_resolve_min_date(user, item),
        )

    account = (
        db.query(Item)
        .filter(Item.id == item.card_account_id, Item.user_id == user.id)
        .first()
    )
    if not account or account.type_code != "bank_account" or account.kind != "ASSET":
        raise HTTPException(status_code=400, detail="Invalid card_account_id")
    if account.currency_code != item.currency_code:
        raise HTTPException(status_code=400, detail="Card and account currencies must match")
    if account.counterparty_id != item.counterparty_id:
        raise HTTPException(status_code=400, detail="Card and account counterparties must match")

    start_date = _resolve_min_date(user, item, account)
    return ResolvedPlanSide(
        selected_item=item,
        effective_item=account,
        card_item=item,
        start_date=start_date,
    )


def _resolve_category_by_name(db: Session, user: User, name: str) -> Category:
    category = (
        db.query(Category)
        .filter(Category.name == name, Category.owner_user_id == user.id)
        .first()
    )
    if not category:
        category = (
            db.query(Category)
            .filter(Category.name == name, Category.owner_user_id.is_(None))
            .first()
        )
    if not category:
        raise HTTPException(status_code=400, detail=f"Category '{name}' not found")
    resolved = resolve_category_or_400(db, user, category.id)
    if not resolved:
        raise HTTPException(status_code=400, detail=f"Category '{name}' is not available")
    return resolved


def _days_in_year(day: date) -> int:
    return 366 if calendar.isleap(day.year) else 365


def _iter_days(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def _round_cents(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _sum_interest_cents(
    principal_cents: int | Decimal, rate: float, start: date, end: date
) -> Decimal:
    principal = Decimal(principal_cents)
    if principal <= 0 or rate <= 0:
        return Decimal(0)
    annual_rate = Decimal(str(rate)) / Decimal(100)
    total = Decimal(0)
    for day in _iter_days(start, end):
        daily_rate = annual_rate / Decimal(_days_in_year(day))
        total += principal * daily_rate
    return total


def _sum_interest_cents_by_days(
    principal_cents: int | Decimal, rate: float, days: int, base_date: date
) -> Decimal:
    """Рассчитывает проценты по указанному количеству дней, используя базовую дату для определения високосного года."""
    principal = Decimal(principal_cents)
    if principal <= 0 or rate <= 0 or days <= 0:
        return Decimal(0)
    annual_rate = Decimal(str(rate)) / Decimal(100)
    days_in_year = Decimal(_days_in_year(base_date))
    return principal * Decimal(days) * annual_rate / days_in_year


def _apply_tail_adjustment(precise: list[Decimal], rounded: list[int]) -> None:
    if not precise:
        return
    total_precise = sum(precise, Decimal(0))
    total_rounded = _round_cents(total_precise)
    tail = total_rounded - sum(rounded)
    rounded[-1] += tail


def _resolve_monthly_schedule(
    base_date: date,
    end_date: date,
    first_rule: str,
) -> tuple[date, int | None, str | None]:
    monthly_day = None
    monthly_rule = None
    start_date = base_date

    if first_rule == "MONTH_END":
        monthly_rule = "LAST_DAY"
    else:
        monthly_day = base_date.day

    if first_rule == "SHIFT_ONE_MONTH":
        year = base_date.year + (base_date.month // 12)
        month = 1 if base_date.month == 12 else base_date.month + 1
        day = min(base_date.day, calendar.monthrange(year, month)[1])
        start_date = date(year, month, day)

    if start_date > end_date:
        raise HTTPException(status_code=400, detail="Plan start date is after end date")
    return start_date, monthly_day, monthly_rule


def _ensure_start_date(start_date: date, min_date: date, label: str) -> None:
    if start_date < min_date:
        raise HTTPException(
            status_code=400,
            detail=f"{label} cannot be earlier than item start date",
        )


def _create_interest_chain(
    db: Session,
    user: User,
    item: Item,
    settings: ItemPlanSettings,
) -> None:
    if item.interest_rate is None:
        raise HTTPException(status_code=400, detail="interest_rate is required for auto plan")
    if item.interest_payout_order is None:
        raise HTTPException(
            status_code=400, detail="interest_payout_order is required for auto plan"
        )
    if item.open_date is None:
        raise HTTPException(status_code=400, detail="open_date is required for auto plan")

    end_date = None
    if item.type_code == "deposit":
        end_date = item.deposit_end_date
    else:
        end_date = settings.plan_end_date
    if end_date is None:
        raise HTTPException(status_code=400, detail="plan_end_date is required for auto plan")

    min_date = _resolve_min_date(user, item)

    if item.interest_payout_order == "MONTHLY":
        if not settings.first_payout_rule:
            raise HTTPException(
                status_code=400, detail="first_payout_rule is required for monthly payouts"
            )
        start_date, monthly_day, monthly_rule = _resolve_monthly_schedule(
            item.open_date, end_date, settings.first_payout_rule
        )
        schedule_dates = build_schedule_dates(
            start_date,
            end_date,
            "MONTHLY",
            None,
            monthly_day,
            monthly_rule,
            None,
        )
        if end_date not in schedule_dates:
            schedule_dates.append(end_date)
    else:
        schedule_dates = [end_date]
        start_date = end_date
        monthly_day = end_date.day
        monthly_rule = None

    schedule_dates = sorted({dt for dt in schedule_dates})
    schedule_dates = [dt for dt in schedule_dates if dt >= min_date]
    if not schedule_dates:
        raise HTTPException(status_code=400, detail="No dates generated for auto plan")

    _ensure_start_date(schedule_dates[0], min_date, "Plan start date")

    if item.interest_capitalization:
        primary_side = ResolvedPlanSide(
            selected_item=item,
            effective_item=item,
            card_item=None,
            start_date=min_date,
        )
    else:
        if item.interest_payout_account_id is None:
            raise HTTPException(
                status_code=400,
                detail="interest_payout_account_id is required when capitalization is disabled",
            )
        primary_side = _resolve_item_for_plan(
            db, user, item.interest_payout_account_id, "interest_payout_account"
        )
        if primary_side.effective_item.kind != "ASSET":
            raise HTTPException(
                status_code=400, detail="interest payout account must be an asset"
        )
        if primary_side.effective_item.currency_code != item.currency_code:
            raise HTTPException(
                status_code=400,
                detail="Interest payout account currency must match item currency",
            )
        _ensure_start_date(schedule_dates[0], primary_side.start_date, "Plan start date")

    amounts_precise: list[Decimal] = []
    amounts_rounded: list[int] = []
    principal_cents = item.initial_value_rub
    
    # Для вкладов используем deposit_term_days вместо фактического количества дней между датами
    if item.type_code == "deposit" and item.deposit_term_days is not None:
        # Для вклада с выплатой в конце срока - используем весь срок вклада
        if item.interest_payout_order != "MONTHLY":
            # Рассчитываем проценты за весь срок вклада
            interest_precise = _sum_interest_cents_by_days(
                principal_cents, item.interest_rate, item.deposit_term_days, item.open_date
            )
            amounts_precise.append(interest_precise)
            rounded = _round_cents(interest_precise)
            amounts_rounded.append(rounded)
        else:
            # Для месячных выплат распределяем дни между выплатами пропорционально
            total_days = item.deposit_term_days
            num_payouts = len(schedule_dates)
            if num_payouts == 0:
                raise HTTPException(status_code=400, detail="No payout dates for deposit")
            
            days_per_payout = total_days // num_payouts
            remaining_days = total_days % num_payouts
            
            for idx, payout_date in enumerate(schedule_dates):
                # Для последней выплаты добавляем остаток дней
                days_for_period = days_per_payout + (remaining_days if idx == num_payouts - 1 else 0)
                
                interest_precise = _sum_interest_cents_by_days(
                    principal_cents, item.interest_rate, days_for_period, item.open_date
                )
                amounts_precise.append(interest_precise)
                rounded = _round_cents(interest_precise)
                amounts_rounded.append(rounded)
                if item.interest_capitalization:
                    principal_cents += rounded
    else:
        # Для накопительных счетов и других типов используем фактическое количество дней
        period_start = item.open_date
        for payout_date in schedule_dates:
            if period_start > payout_date:
                continue
            interest_precise = _sum_interest_cents(
                principal_cents, item.interest_rate, period_start, payout_date
            )
            amounts_precise.append(interest_precise)
            rounded = _round_cents(interest_precise)
            amounts_rounded.append(rounded)
            if item.interest_capitalization:
                principal_cents += rounded
            period_start = payout_date + timedelta(days=1)

    _apply_tail_adjustment(amounts_precise, amounts_rounded)
    if not amounts_rounded:
        raise HTTPException(status_code=400, detail="No interest amounts generated")

    category_name = (
        "Проценты по вкладам"
        if item.type_code == "deposit"
        else "Проценты по накопительным счетам"
    )
    category = _resolve_category_by_name(db, user, category_name)

    _create_chain_with_transactions(
        db=db,
        user=user,
        item=item,
        settings=settings,
        chain_name=f"Проценты: {item.name}",
        schedule_dates=schedule_dates,
        amounts=amounts_rounded,
        direction="INCOME",
        primary_item=primary_side.effective_item,
        primary_card_item=primary_side.card_item,
        counterparty_item=None,
        counterparty_card_item=None,
        counterparty_id=item.counterparty_id,
        category_id=category.id,
        purpose="INTEREST",
        frequency="MONTHLY",
        start_date=schedule_dates[0],
        end_date=schedule_dates[-1],
        monthly_day=monthly_day,
        monthly_rule=monthly_rule,
        interval_days=None,
        weekly_day=None,
    )


def _create_loan_chains(
    db: Session,
    user: User,
    item: Item,
    settings: ItemPlanSettings,
) -> None:
    if item.interest_rate is None:
        raise HTTPException(status_code=400, detail="interest_rate is required for loan plan")
    if settings.repayment_frequency is None:
        raise HTTPException(status_code=400, detail="repayment_frequency is required")
    if settings.repayment_account_id is None:
        raise HTTPException(status_code=400, detail="repayment_account_id is required")
    if settings.repayment_type is None:
        raise HTTPException(status_code=400, detail="repayment_type is required")

    end_date = settings.loan_end_date or settings.plan_end_date
    full_repayment = settings.loan_end_date is not None
    if end_date is None:
        raise HTTPException(status_code=400, detail="plan_end_date is required for loan plan")

    min_date = _resolve_min_date(user, item)
    base_date = max(item.open_date, min_date) if item.open_date else min_date
    if item.kind == "LIABILITY" and item.open_date is None:
        raise HTTPException(status_code=400, detail="open_date is required for liability loan plan")
    if item.kind == "LIABILITY":
        full_repayment = True
    start_date = base_date
    monthly_day = settings.repayment_monthly_day
    monthly_rule = settings.repayment_monthly_rule
    weekly_day = settings.repayment_weekly_day
    interval_days = settings.repayment_interval_days

    if settings.repayment_frequency == "MONTHLY":
        if not settings.first_payout_rule:
            raise HTTPException(
                status_code=400, detail="first_payout_rule is required for monthly payouts"
            )
        start_date, monthly_day, monthly_rule = _resolve_monthly_schedule(
            base_date, end_date, settings.first_payout_rule
        )

    schedule_dates = build_schedule_dates(
        start_date,
        end_date,
        settings.repayment_frequency,
        weekly_day,
        monthly_day,
        monthly_rule,
        interval_days,
    )
    schedule_dates = sorted({dt for dt in schedule_dates})
    if full_repayment and schedule_dates and schedule_dates[-1] != end_date:
        schedule_dates.append(end_date)
    schedule_dates = sorted({dt for dt in schedule_dates})
    schedule_dates = [dt for dt in schedule_dates if dt >= min_date]

    if not schedule_dates:
        raise HTTPException(status_code=400, detail="No dates generated for loan plan")

    _ensure_start_date(schedule_dates[0], min_date, "Plan start date")

    repayment_side = _resolve_item_for_plan(
        db, user, settings.repayment_account_id, "repayment_account"
    )
    if repayment_side.effective_item.kind != "ASSET":
        raise HTTPException(
            status_code=400, detail="repayment account must be an asset"
        )
    if repayment_side.effective_item.currency_code != item.currency_code:
        raise HTTPException(
            status_code=400, detail="Repayment account currency must match loan currency"
        )
    _ensure_start_date(schedule_dates[0], repayment_side.start_date, "Plan start date")

    if item.kind == "LIABILITY":
        principal_amounts, interest_amounts = _build_auto_loan_schedule(
            principal_cents=item.initial_value_rub,
            rate=item.interest_rate,
            period_start=base_date,
            payout_dates=schedule_dates,
            repayment_type=settings.repayment_type,
        )
    else:
        if settings.payment_amount_rub is None or settings.payment_amount_kind is None:
            raise HTTPException(status_code=400, detail="payment amount is required")
        principal_amounts, interest_amounts = _build_loan_schedule(
            principal_cents=item.initial_value_rub,
            rate=item.interest_rate,
            period_start=base_date,
            payout_dates=schedule_dates,
            payment_amount_kind=settings.payment_amount_kind,
            payment_amount_cents=settings.payment_amount_rub,
            full_repayment=full_repayment,
        )

    if item.kind == "LIABILITY":
        principal_primary = repayment_side.effective_item
        principal_primary_card = repayment_side.card_item
        principal_counterparty = item
        principal_counterparty_card = None
        interest_direction = "EXPENSE"
        interest_category = _resolve_category_by_name(
            db, user, "Оплата плановых процентов по кредитам"
        )
    else:
        principal_primary = item
        principal_primary_card = None
        principal_counterparty = repayment_side.effective_item
        principal_counterparty_card = repayment_side.card_item
        interest_direction = "INCOME"
        interest_category = _resolve_category_by_name(db, user, "Проценты по займам")

    _create_chain_with_transactions(
        db=db,
        user=user,
        item=item,
        settings=settings,
        chain_name=f"Погашение основного долга: {item.name}",
        schedule_dates=schedule_dates,
        amounts=principal_amounts,
        direction="TRANSFER",
        primary_item=principal_primary,
        primary_card_item=principal_primary_card,
        counterparty_item=principal_counterparty,
        counterparty_card_item=principal_counterparty_card,
        counterparty_id=None,
        category_id=None,
        purpose="PRINCIPAL",
        frequency=settings.repayment_frequency,
        start_date=schedule_dates[0],
        end_date=schedule_dates[-1],
        monthly_day=monthly_day,
        monthly_rule=monthly_rule,
        interval_days=interval_days,
        weekly_day=weekly_day,
    )

    _create_chain_with_transactions(
        db=db,
        user=user,
        item=item,
        settings=settings,
        chain_name=f"Проценты: {item.name}",
        schedule_dates=schedule_dates,
        amounts=interest_amounts,
        direction=interest_direction,
        primary_item=repayment_side.effective_item,
        primary_card_item=repayment_side.card_item,
        counterparty_item=None,
        counterparty_card_item=None,
        counterparty_id=None,
        category_id=interest_category.id,
        purpose="INTEREST",
        frequency=settings.repayment_frequency,
        start_date=schedule_dates[0],
        end_date=schedule_dates[-1],
        monthly_day=monthly_day,
        monthly_rule=monthly_rule,
        interval_days=interval_days,
        weekly_day=weekly_day,
    )


def _build_loan_schedule(
    principal_cents: int,
    rate: float,
    period_start: date,
    payout_dates: list[date],
    payment_amount_kind: str,
    payment_amount_cents: int,
    full_repayment: bool,
) -> tuple[list[int], list[int]]:
    if payment_amount_cents <= 0:
        raise HTTPException(status_code=400, detail="payment_amount_rub must be positive")

    interest_precise: list[Decimal] = []
    interest_rounded: list[int] = []
    principal_payments: list[int | None] = []
    outstanding = principal_cents

    for idx, payout_date in enumerate(payout_dates):
        if period_start > payout_date:
            interest_precise.append(Decimal(0))
            interest_rounded.append(0)
            principal_payments.append(0)
            continue

        interest_value = _sum_interest_cents(outstanding, rate, period_start, payout_date)
        interest_precise.append(interest_value)
        rounded_interest = _round_cents(interest_value)
        interest_rounded.append(rounded_interest)

        is_last = idx == len(payout_dates) - 1
        if is_last:
            principal_payments.append(None)
        else:
            principal_payment = _resolve_principal_payment(
                outstanding, rounded_interest, payment_amount_kind, payment_amount_cents
            )
            outstanding = max(outstanding - principal_payment, 0)
            principal_payments.append(principal_payment)

        period_start = payout_date + timedelta(days=1)

    _apply_tail_adjustment(interest_precise, interest_rounded)

    if principal_payments and principal_payments[-1] is None:
        if full_repayment:
            principal_payments[-1] = max(outstanding, 0)
        else:
            principal_payments[-1] = _resolve_principal_payment(
                outstanding,
                interest_rounded[-1],
                payment_amount_kind,
                payment_amount_cents,
            )

    principal_final: list[int] = []
    for value in principal_payments:
        principal_final.append(int(value or 0))

    return principal_final, interest_rounded


def _build_auto_loan_schedule(
    principal_cents: int,
    rate: float,
    period_start: date,
    payout_dates: list[date],
    repayment_type: str,
) -> tuple[list[int], list[int]]:
    if repayment_type == "ANNUITY":
        return _build_annuity_schedule(
            principal_cents, rate, period_start, payout_dates
        )
    if repayment_type == "DIFFERENTIATED":
        return _build_differentiated_schedule(
            principal_cents, rate, period_start, payout_dates
        )
    raise HTTPException(status_code=400, detail="Invalid repayment_type")


def _simulate_annuity_outstanding(
    principal_cents: int,
    rate: float,
    period_start: date,
    payout_dates: list[date],
    payment_cents: int,
) -> Decimal:
    outstanding = Decimal(principal_cents)
    start = period_start
    for payout_date in payout_dates:
        interest = _sum_interest_cents(outstanding, rate, start, payout_date)
        principal_payment = Decimal(payment_cents) - interest
        if principal_payment <= 0:
            return outstanding
        outstanding -= principal_payment
        start = payout_date + timedelta(days=1)
    return outstanding


def _find_annuity_payment(
    principal_cents: int,
    rate: float,
    period_start: date,
    payout_dates: list[date],
) -> int:
    if principal_cents <= 0:
        return 0
    low = 1
    high = max(principal_cents, 1)
    attempts = 0
    while _simulate_annuity_outstanding(
        principal_cents, rate, period_start, payout_dates, high
    ) > 0:
        high *= 2
        attempts += 1
        if attempts > 40:
            raise HTTPException(
                status_code=400,
                detail="Unable to calculate annuity payment for the given schedule",
            )
    while low < high:
        mid = (low + high) // 2
        if (
            _simulate_annuity_outstanding(
                principal_cents, rate, period_start, payout_dates, mid
            )
            <= 0
        ):
            high = mid
        else:
            low = mid + 1
    return low


def _build_annuity_schedule(
    principal_cents: int,
    rate: float,
    period_start: date,
    payout_dates: list[date],
) -> tuple[list[int], list[int]]:
    if not payout_dates:
        raise HTTPException(status_code=400, detail="No dates generated for loan plan")
    payment_cents = _find_annuity_payment(principal_cents, rate, period_start, payout_dates)
    interest_precise: list[Decimal] = []
    interest_rounded: list[int] = []
    principal_payments: list[int] = []
    outstanding = principal_cents
    start = period_start
    for idx, payout_date in enumerate(payout_dates):
        interest_value = _sum_interest_cents(outstanding, rate, start, payout_date)
        interest_precise.append(interest_value)
        rounded_interest = _round_cents(interest_value)
        interest_rounded.append(rounded_interest)
        is_last = idx == len(payout_dates) - 1
        if is_last:
            principal_payment = max(outstanding, 0)
        else:
            principal_payment = payment_cents - rounded_interest
            if principal_payment <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="Calculated annuity payment does not cover interest",
                )
            principal_payment = min(principal_payment, outstanding)
        principal_payments.append(int(principal_payment))
        outstanding = max(outstanding - principal_payment, 0)
        start = payout_date + timedelta(days=1)

    _apply_tail_adjustment(interest_precise, interest_rounded)
    return principal_payments, interest_rounded


def _build_differentiated_schedule(
    principal_cents: int,
    rate: float,
    period_start: date,
    payout_dates: list[date],
) -> tuple[list[int], list[int]]:
    if not payout_dates:
        raise HTTPException(status_code=400, detail="No dates generated for loan plan")
    total_periods = len(payout_dates)
    base_principal = principal_cents // total_periods if total_periods else 0
    interest_precise: list[Decimal] = []
    interest_rounded: list[int] = []
    principal_payments: list[int] = []
    outstanding = principal_cents
    start = period_start
    for idx, payout_date in enumerate(payout_dates):
        interest_value = _sum_interest_cents(outstanding, rate, start, payout_date)
        interest_precise.append(interest_value)
        interest_rounded.append(_round_cents(interest_value))
        is_last = idx == total_periods - 1
        principal_payment = max(outstanding, 0) if is_last else base_principal
        principal_payments.append(int(principal_payment))
        outstanding = max(outstanding - principal_payment, 0)
        start = payout_date + timedelta(days=1)

    _apply_tail_adjustment(interest_precise, interest_rounded)
    return principal_payments, interest_rounded


def _resolve_principal_payment(
    outstanding: int,
    interest_cents: int,
    payment_amount_kind: str,
    payment_amount_cents: int,
) -> int:
    if payment_amount_kind == "TOTAL":
        principal_payment = payment_amount_cents - interest_cents
        if principal_payment <= 0:
            raise HTTPException(
                status_code=400,
                detail="Payment amount does not cover interest for the period",
            )
        return min(principal_payment, outstanding)
    principal_payment = min(payment_amount_cents, outstanding)
    return principal_payment


def _create_chain_with_transactions(
    db: Session,
    user: User,
    item: Item,
    settings: ItemPlanSettings,
    chain_name: str,
    schedule_dates: list[date],
    amounts: list[int],
    direction: str,
    primary_item: Item,
    primary_card_item: Item | None,
    counterparty_item: Item | None,
    counterparty_card_item: Item | None,
    counterparty_id: int | None,
    category_id: int | None,
    purpose: str,
    frequency: str,
    start_date: date,
    end_date: date,
    monthly_day: int | None,
    monthly_rule: str | None,
    interval_days: int | None,
    weekly_day: int | None,
) -> None:
    if len(schedule_dates) != len(amounts):
        raise HTTPException(status_code=400, detail="Schedule length mismatch")

    amount_min = min(amounts)
    amount_max = max(amounts)
    is_variable = amount_min != amount_max
    chain = TransactionChain(
        user_id=user.id,
        name=chain_name,
        start_date=start_date,
        end_date=end_date,
        frequency=frequency,
        weekly_day=weekly_day,
        monthly_day=monthly_day,
        monthly_rule=monthly_rule,
        interval_days=interval_days,
        linked_item_id=item.id,
        source="AUTO_ITEM",
        purpose=purpose,
        primary_item_id=primary_item.id,
        primary_card_item_id=primary_card_item.id if primary_card_item else None,
        counterparty_item_id=counterparty_item.id if counterparty_item else None,
        counterparty_card_item_id=counterparty_card_item.id if counterparty_card_item else None,
        counterparty_id=counterparty_id,
        amount_rub=amount_min,
        amount_counterparty=amount_min if direction == "TRANSFER" else None,
        amount_is_variable=is_variable,
        amount_min_rub=amount_min,
        amount_max_rub=amount_max,
        direction=direction,
        category_id=category_id,
        description=None,
        comment=None,
    )
    db.add(chain)
    db.flush()

    txs = []
    for tx_date, amount in zip(schedule_dates, amounts):
        txs.append(
            Transaction(
                user_id=user.id,
                chain_id=chain.id,
                transaction_date=datetime.combine(tx_date, datetime.min.time()),
                primary_item_id=primary_item.id,
                primary_card_item_id=primary_card_item.id if primary_card_item else None,
                counterparty_item_id=counterparty_item.id if counterparty_item else None,
                counterparty_card_item_id=counterparty_card_item.id
                if counterparty_card_item
                else None,
                counterparty_id=counterparty_id,
                amount_rub=amount,
                amount_counterparty=amount if direction == "TRANSFER" else None,
                direction=direction,
                transaction_type="PLANNED",
                status="CONFIRMED",
                category_id=category_id,
                description=None,
                comment=None,
            )
        )

    db.add_all(txs)
