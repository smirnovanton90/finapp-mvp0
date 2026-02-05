from datetime import datetime, timezone, date as date_type

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth import get_current_user
from category_service import resolve_category_or_400
from db import get_db
from models import Goal, User
from schemas import GoalCreate, GoalOut

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
