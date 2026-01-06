from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth import get_current_user
from category_service import resolve_category_or_400
from db import get_db
from models import Limit, User
from schemas import LimitCreate, LimitOut

router = APIRouter(prefix="/limits", tags=["limits"])


def _resolve_expense_category(db: Session, user: User, category_id: int | None):
    category = resolve_category_or_400(db, user, category_id)
    if not category:
        raise HTTPException(status_code=400, detail="category_id is required")
    if category.scope not in ("EXPENSE", "BOTH"):
        raise HTTPException(status_code=400, detail="Limit category must be EXPENSE")
    return category


@router.get("", response_model=list[LimitOut])
def list_limits(
    include_deleted: bool = Query(default=False),
    deleted_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Limit).where(Limit.user_id == user.id)
    if deleted_only:
        stmt = stmt.where(Limit.deleted_at.isnot(None))
    elif not include_deleted:
        stmt = stmt.where(Limit.deleted_at.is_(None))
    stmt = stmt.order_by(Limit.created_at.desc(), Limit.id.desc())
    return list(db.execute(stmt).scalars())


@router.post("", response_model=LimitOut)
def create_limit(
    data: LimitCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    category = _resolve_expense_category(db, user, data.category_id)
    limit = Limit(
        user_id=user.id,
        name=data.name,
        period=data.period,
        custom_start_date=data.custom_start_date,
        custom_end_date=data.custom_end_date,
        category_id=category.id,
        amount_rub=data.amount_rub,
    )
    db.add(limit)
    db.commit()
    db.refresh(limit)
    return limit


@router.patch("/{limit_id}", response_model=LimitOut)
def update_limit(
    limit_id: int,
    data: LimitCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    limit = (
        db.query(Limit)
        .filter(Limit.id == limit_id, Limit.user_id == user.id)
        .first()
    )
    if not limit:
        raise HTTPException(status_code=404, detail="Limit not found")
    if limit.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Cannot edit deleted limit")

    category = _resolve_expense_category(db, user, data.category_id)

    limit.name = data.name
    limit.period = data.period
    limit.custom_start_date = data.custom_start_date
    limit.custom_end_date = data.custom_end_date
    limit.category_id = category.id
    limit.amount_rub = data.amount_rub

    db.commit()
    db.refresh(limit)
    return limit


@router.delete("/{limit_id}")
def delete_limit(
    limit_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    limit = (
        db.query(Limit)
        .filter(Limit.id == limit_id, Limit.user_id == user.id)
        .first()
    )
    if not limit:
        raise HTTPException(status_code=404, detail="Limit not found")
    if limit.deleted_at is not None:
        return {"ok": True}

    limit.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}
