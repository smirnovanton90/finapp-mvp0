from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Category, User, UserCategoryState


def resolve_category_or_none(
    db: Session, user: User, category_id: int | None
) -> Category | None:
    """Return category or None if not found. Raises for 403/archived/disabled."""
    if category_id is None:
        return None

    category = db.get(Category, category_id)
    if not category:
        return None

    if category.owner_user_id not in (None, user.id):
        raise HTTPException(
            status_code=403, detail="Category is not available for this user"
        )

    if category.archived_at is not None:
        raise HTTPException(status_code=400, detail="Category is archived")

    state = db.execute(
        select(UserCategoryState).where(
            UserCategoryState.user_id == user.id,
            UserCategoryState.category_id == category_id,
        )
    ).scalar_one_or_none()
    if state and not state.enabled:
        raise HTTPException(status_code=400, detail="Category is disabled")

    return category


def resolve_category_or_400(
    db: Session, user: User, category_id: int | None
) -> Category | None:
    if category_id is None:
        return None

    category = resolve_category_or_none(db, user, category_id)
    if category is None:
        raise HTTPException(status_code=400, detail="Invalid category_id")
    return category
