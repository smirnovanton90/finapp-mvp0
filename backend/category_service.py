from typing import Iterable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from category_defaults import DEFAULT_CATEGORIES_L1, DEFAULT_CATEGORIES_L2
from models import Category, User


def ensure_default_categories(db: Session, user: User) -> None:
    existing = db.execute(
        select(Category.id).where(Category.user_id == user.id).limit(1)
    ).scalar_one_or_none()

    if existing:
        return

    parents: dict[str, Category] = {}

    for name in DEFAULT_CATEGORIES_L1:
        cat = Category(user_id=user.id, level=1, name=name)
        db.add(cat)
        db.flush()
        parents[name] = cat

    for parent_name, children in DEFAULT_CATEGORIES_L2.items():
        parent = parents.get(parent_name)
        if not parent:
            continue

        for child_name in children:
            cat = Category(
                user_id=user.id, level=2, name=child_name, parent_id=parent.id
            )
            db.add(cat)

    db.commit()


def validate_category_hierarchy(
    *,
    db: Session,
    user: User,
    category_l1: str,
    category_l2: str,
    category_l3: str,
) -> None:
    if not category_l1:
        raise HTTPException(status_code=400, detail="category_l1 is required")

    l1 = db.execute(
        select(Category).where(
            Category.user_id == user.id, Category.level == 1, Category.name == category_l1
        )
    ).scalar_one_or_none()

    if not l1:
        raise HTTPException(status_code=400, detail="Unknown category_l1")

    if category_l2:
        l2 = db.execute(
            select(Category).where(
                Category.user_id == user.id,
                Category.level == 2,
                Category.name == category_l2,
                Category.parent_id == l1.id,
            )
        ).scalar_one_or_none()

        if not l2:
            raise HTTPException(status_code=400, detail="Invalid category_l2 for category_l1")

        if category_l3:
            l3 = db.execute(
                select(Category).where(
                    Category.user_id == user.id,
                    Category.level == 3,
                    Category.name == category_l3,
                    Category.parent_id == l2.id,
                )
            ).scalar_one_or_none()

            if not l3:
                raise HTTPException(
                    status_code=400, detail="Invalid category_l3 for category_l2"
                )
    elif category_l3:
        raise HTTPException(status_code=400, detail="category_l3 requires category_l2")


def collect_descendants(category_id: int, categories: Iterable[Category]) -> set[int]:
    ids = {category_id}
    lookup = {}
    for cat in categories:
        lookup.setdefault(cat.parent_id, []).append(cat)

    queue = [category_id]
    while queue:
        current = queue.pop()
        for child in lookup.get(current, []):
            if child.id not in ids:
                ids.add(child.id)
                queue.append(child.id)

    return ids
