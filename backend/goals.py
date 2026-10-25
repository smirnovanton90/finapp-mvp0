from datetime import datetime, time, timedelta, timezone, date as date_type
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from auth import get_current_user
from category_service import resolve_category_or_400
from db import get_db
from models import Category, FxRate, Goal, Item, Transaction, User
from schemas import GoalCreate, GoalDeletedAtUpdate, GoalOut, GoalProgressOut, GoalProgressPeriodOut
from timezones import effective_timezone, transaction_instant

router = APIRouter(prefix="/goals", tags=["goals"])


def _resolve_goal_category(db: Session, user: User, category_id: int | None):
    """Категория цели: допускаются расходы (EXPENSE/BOTH) и доходы (INCOME/BOTH)."""
    category = resolve_category_or_400(db, user, category_id)
    if not category:
        raise HTTPException(status_code=400, detail="category_id is required")
    if category.scope not in ("EXPENSE", "INCOME", "BOTH"):
        raise HTTPException(
            status_code=400,
            detail="Goal category must be EXPENSE, INCOME or BOTH",
        )
    return category


def _ensure_accounting_start_date(user: User) -> date_type:
    if not user.accounting_start_date:
        raise HTTPException(status_code=400, detail="Accounting start date is not set.")
    return user.accounting_start_date


def _validate_custom_start_date(user: User, start_date: date_type | None) -> None:
    if start_date is None:
        return
    min_date = _ensure_accounting_start_date(user)
    if start_date < min_date:
        raise HTTPException(
            status_code=400,
            detail="custom_start_date cannot be earlier than accounting start date",
        )


@router.get("", response_model=list[GoalOut])
def list_goals(
    include_deleted: bool = Query(default=False),
    deleted_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Goal).where(Goal.user_id == user.id)
    if deleted_only:
        stmt = stmt.where(Goal.deleted_at.isnot(None))
    elif not include_deleted:
        stmt = stmt.where(Goal.deleted_at.is_(None))
    stmt = stmt.order_by(Goal.created_at.desc(), Goal.id.desc())
    return list(db.execute(stmt).scalars())


def _month_end(day: date_type) -> date_type:
    if day.month == 12:
        return date_type(day.year, 12, 31)
    return date_type(day.year, day.month + 1, 1) - timedelta(days=1)


def _current_goal_range(goal: Goal, today: date_type) -> tuple[date_type, date_type] | None:
    if goal.period == "CUSTOM":
        if not goal.custom_start_date or not goal.custom_end_date:
            return None
        return goal.custom_start_date, goal.custom_end_date
    if goal.period == "WEEKLY":
        start = today - timedelta(days=today.weekday())
        return start, start + timedelta(days=6)
    if goal.period == "MONTHLY":
        return today.replace(day=1), _month_end(today)
    return date_type(today.year, 1, 1), date_type(today.year, 12, 31)


def _history_ranges(
    goal: Goal,
    today: date_type,
    created: date_type,
) -> list[tuple[date_type, date_type]]:
    current = _current_goal_range(goal, today)
    if not current or goal.period == "CUSTOM":
        return []
    ranges: list[tuple[date_type, date_type]] = []
    if goal.period == "MONTHLY":
        year, month = today.year, today.month - 1
        if month == 0:
            year, month = year - 1, 12
        while (year, month) >= (created.year, created.month):
            start = date_type(year, month, 1)
            ranges.append((start, _month_end(start)))
            month -= 1
            if month == 0:
                year, month = year - 1, 12
    elif goal.period == "WEEKLY":
        start = today - timedelta(days=today.weekday()) - timedelta(days=7)
        while start >= created and len(ranges) < 24:
            ranges.append((start, start + timedelta(days=6)))
            start -= timedelta(days=7)
    elif goal.period == "YEARLY":
        for year in range(today.year - 1, created.year - 1, -1):
            ranges.append((date_type(year, 1, 1), date_type(year, 12, 31)))
            if len(ranges) >= 12:
                break
    return ranges


def _category_descendants(db: Session) -> dict[int, set[int]]:
    rows = db.query(Category.id, Category.parent_id).all()
    children: dict[int, list[int]] = {}
    for category_id, parent_id in rows:
        if parent_id is not None:
            children.setdefault(parent_id, []).append(category_id)
    descendants: dict[int, set[int]] = {}

    def collect(category_id: int) -> set[int]:
        cached = descendants.get(category_id)
        if cached is not None:
            return cached
        found = {category_id}
        for child_id in children.get(category_id, []):
            found |= collect(child_id)
        descendants[category_id] = found
        return found

    for category_id, _parent_id in rows:
        collect(category_id)
    return descendants


def _rate_on_or_before(series: list[tuple[date_type, float]], day: date_type) -> float | None:
    best: float | None = None
    for rate_date, rate in series:
        if rate_date <= day:
            best = rate
        else:
            break
    return best


@router.get("/progress", response_model=list[GoalProgressOut])
def goal_progress(
    include_deleted: bool = Query(default=False),
    include_history: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Факт по целям в рублях за текущий период и, по запросу, за прошлые."""
    stmt = select(Goal).where(Goal.user_id == user.id)
    if not include_deleted:
        stmt = stmt.where(Goal.deleted_at.is_(None))
    goals = list(db.execute(stmt).scalars())
    if not goals:
        return []
    zone = ZoneInfo(effective_timezone(user))
    today = datetime.now(zone).date()
    scopes = {
        row.id: row.scope
        for row in db.query(Category.id, Category.scope).all()
    }
    descendants = _category_descendants(db)
    ranges_by_goal: dict[int, tuple[tuple[date_type, date_type] | None, list[tuple[date_type, date_type]]]] = {}
    window_start: date_type | None = None
    window_end: date_type | None = None
    for goal in goals:
        current = _current_goal_range(goal, today)
        created_at = goal.created_at
        if created_at is not None and created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        created = created_at.astimezone(zone).date() if created_at else today
        history = _history_ranges(goal, today, created) if include_history else []
        ranges_by_goal[goal.id] = (current, history)
        for start, end in ([current] if current else []) + history:
            window_start = start if window_start is None else min(window_start, start)
            window_end = end if window_end is None else max(window_end, end)
    buckets: dict[int, dict[date_type, dict[str, int]]] = {}
    if window_start and window_end:
        tx_rows = (
            db.query(
                Transaction.direction,
                Transaction.category_id,
                Transaction.amount_primary_minor,
                Transaction.transaction_date,
                Transaction.timezone,
                Item.currency_code,
            )
            .join(Item, Item.id == Transaction.primary_item_id)
            .filter(
                Transaction.user_id == user.id,
                Transaction.deleted_at.is_(None),
                Transaction.is_split_parent.is_(False),
                Transaction.category_id.isnot(None),
                Transaction.direction.in_(("INCOME", "EXPENSE")),
                or_(
                    Transaction.transaction_type == "ACTUAL",
                    Transaction.status == "REALIZED",
                ),
                Transaction.transaction_date >= datetime.combine(window_start, time.min) - timedelta(days=1),
                Transaction.transaction_date <= datetime.combine(window_end, time.max) + timedelta(days=1),
            )
            .all()
        )
        currencies = {
            (row.currency_code or "RUB").upper()
            for row in tx_rows
            if (row.currency_code or "RUB").upper() != "RUB"
        }
        rate_series: dict[str, list[tuple[date_type, float]]] = {}
        if currencies:
            rate_rows = (
                db.query(FxRate.rate_date, FxRate.char_code, FxRate.rate)
                .filter(
                    FxRate.char_code.in_(currencies),
                    FxRate.rate_date <= window_end,
                    FxRate.rate_date >= window_start - timedelta(days=60),
                    FxRate.rate > 0,
                )
                .order_by(FxRate.rate_date.asc())
                .all()
            )
            for rate_date, code, rate in rate_rows:
                rate_series.setdefault(code, []).append((rate_date, float(rate)))
        for row in tx_rows:
            if row.category_id is None:
                continue
            local_day = transaction_instant(row.transaction_date, row.timezone).astimezone(zone).date()
            if local_day < window_start or local_day > window_end:
                continue
            code = (row.currency_code or "RUB").upper()
            amount = row.amount_primary_minor or 0
            if code == "RUB":
                rub = amount
            else:
                rate = _rate_on_or_before(rate_series.get(code, []), local_day)
                if rate is None:
                    continue
                rub = int(round((amount / 100) * rate * 100))
            if rub == 0:
                continue
            days = buckets.setdefault(row.category_id, {})
            dirs = days.setdefault(local_day, {})
            dirs[row.direction] = dirs.get(row.direction, 0) + rub

    def amount_for(goal: Goal, start: date_type, end: date_type) -> int:
        scope = scopes.get(goal.category_id)
        direction = "INCOME" if scope == "INCOME" else "EXPENSE"
        category_ids = descendants.get(goal.category_id, {goal.category_id})
        total = 0
        for category_id in category_ids:
            for day, dirs in buckets.get(category_id, {}).items():
                if start <= day <= end:
                    total += dirs.get(direction, 0)
        return total

    result: list[GoalProgressOut] = []
    for goal in goals:
        current, history = ranges_by_goal[goal.id]
        result.append(
            GoalProgressOut(
                goal_id=goal.id,
                rub_cents=amount_for(goal, *current) if current else 0,
                history=[
                    GoalProgressPeriodOut(
                        start_date=start,
                        end_date=end,
                        rub_cents=amount_for(goal, start, end),
                    )
                    for start, end in history
                ],
            )
        )
    return result


@router.post("", response_model=GoalOut)
def create_goal(
    data: GoalCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    category = _resolve_goal_category(db, user, data.category_id)
    if data.period == "CUSTOM":
        _validate_custom_start_date(user, data.custom_start_date)
    goal = Goal(
        user_id=user.id,
        name=data.name,
        period=data.period,
        custom_start_date=data.custom_start_date,
        custom_end_date=data.custom_end_date,
        category_id=category.id,
        amount_rub=data.amount_rub,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.patch("/{goal_id}", response_model=GoalOut)
def update_goal(
    goal_id: int,
    data: GoalCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    goal = (
        db.query(Goal)
        .filter(Goal.id == goal_id, Goal.user_id == user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if goal.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Cannot edit deleted goal")

    category = _resolve_goal_category(db, user, data.category_id)
    if data.period == "CUSTOM":
        _validate_custom_start_date(user, data.custom_start_date)

    goal.name = data.name
    goal.period = data.period
    goal.custom_start_date = data.custom_start_date
    goal.custom_end_date = data.custom_end_date
    goal.category_id = category.id
    goal.amount_rub = data.amount_rub

    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/{goal_id}")
def delete_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    goal = (
        db.query(Goal)
        .filter(Goal.id == goal_id, Goal.user_id == user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if goal.deleted_at is not None:
        return {"ok": True}

    goal.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.patch("/{goal_id}/deleted_at", response_model=GoalOut)
def update_goal_deleted_at(
    goal_id: int,
    payload: GoalDeletedAtUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Установить или обновить дату удаления цели (при восстановлении из бэкапа)."""
    goal = (
        db.query(Goal)
        .filter(Goal.id == goal_id, Goal.user_id == user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    deleted_dt = datetime.combine(payload.deleted_date, time.min, tzinfo=timezone.utc)
    goal.deleted_at = deleted_dt
    db.commit()
    db.refresh(goal)
    return goal
