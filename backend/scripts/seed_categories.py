import argparse

from sqlalchemy import select

from category_seed_data import CATEGORY_ICON_BY_L1, CATEGORY_SEED
from db import SessionLocal
from models import Category


def normalize_icon(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip()
    return cleaned or None


def upsert_category(
    session,
    name: str,
    scope: str,
    parent_id: int | None,
    owner_user_id: int | None,
    icon_name: str | None,
) -> Category:
    existing = session.execute(
        select(Category).where(
            Category.name == name,
            Category.parent_id == parent_id,
            Category.owner_user_id.is_(owner_user_id),
        )
    ).scalar_one_or_none()

    if existing:
        existing.scope = scope
        existing.icon_name = icon_name
        return existing

    category = Category(
        name=name,
        scope=scope,
        parent_id=parent_id,
        owner_user_id=owner_user_id,
        icon_name=icon_name,
    )
    session.add(category)
    session.flush()
    return category


def seed_tree(session, items: list[dict], scope: str, parent_id: int | None) -> None:
    for item in items:
        name = item["name"].strip()
        node_scope = item.get("scope", scope)
        icon_name = normalize_icon(CATEGORY_ICON_BY_L1.get(name)) if parent_id is None else None
        category = upsert_category(
            session,
            name=name,
            scope=node_scope,
            parent_id=parent_id,
            owner_user_id=None,
            icon_name=icon_name,
        )
        children = item.get("children") or []
        if children:
            seed_tree(session, children, node_scope, category.id)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed default categories.")
    parser.add_argument("--dry-run", action="store_true", help="Validate without DB commit")
    args = parser.parse_args()

    session = SessionLocal()
    try:
        seed_tree(session, CATEGORY_SEED, scope="BOTH", parent_id=None)
        if args.dry_run:
            session.rollback()
        else:
            session.commit()
    finally:
        session.close()

    print("Seeded categories")


if __name__ == "__main__":
    main()
