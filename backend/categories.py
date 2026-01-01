from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth import get_current_user
from category_service import (
    collect_descendants,
    ensure_default_categories,
)
from db import get_db
from models import Category, User
from schemas import CategoryCreate, CategoryOut

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ensure_default_categories(db, user)

    stmt = select(Category).where(Category.user_id == user.id).order_by(
        Category.level, Category.name
    )
    return list(db.execute(stmt).scalars())


@router.post("", response_model=CategoryOut)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ensure_default_categories(db, user)

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    if payload.level == 1:
        parent_id = None
    elif payload.level in (2, 3):
        if not payload.parent_id:
            raise HTTPException(status_code=400, detail="parent_id is required")

        parent = db.get(Category, payload.parent_id)
        if not parent or parent.user_id != user.id:
            raise HTTPException(status_code=404, detail="Parent not found")

        if parent.level != payload.level - 1:
            raise HTTPException(status_code=400, detail="Invalid parent level")

        parent_id = parent.id
    else:
        raise HTTPException(status_code=400, detail="Unsupported level")

    duplicate = db.execute(
        select(Category).where(
            Category.user_id == user.id,
            Category.level == payload.level,
            Category.name == name,
            Category.parent_id.is_(parent_id)
            if parent_id is None
            else Category.parent_id == parent_id,
        )
    ).scalar_one_or_none()

    if duplicate:
        raise HTTPException(status_code=409, detail="Category already exists")

    cat = Category(user_id=user.id, name=name, level=payload.level, parent_id=parent_id)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ensure_default_categories(db, user)

    category = db.get(Category, category_id)
    if not category or category.user_id != user.id:
        raise HTTPException(status_code=404, detail="Category not found")

    categories = db.execute(
        select(Category).where(Category.user_id == user.id)
    ).scalars()
    ids_to_delete = collect_descendants(category.id, categories)

    db.query(Category).filter(Category.id.in_(ids_to_delete)).delete(
        synchronize_session=False
    )
    db.commit()

    return {"ok": True}
