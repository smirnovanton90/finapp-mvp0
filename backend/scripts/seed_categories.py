import argparse
import os
import sys

# Загружаем .env из директории backend при запуске из корня проекта
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if os.path.basename(_backend_dir) == "backend" and _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
    os.chdir(_backend_dir)

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from category_seed_data import CATEGORY_ICON_BY_L1, CATEGORY_ICON_BY_L2, CATEGORY_SEED
from db import SessionLocal
from models import Category, Goal, Transaction, TransactionChain, UserCategoryState

# Устаревшие глобальные категории: удаляем после сидирования (переназначаем ссылки на новые).
OBSOLETE_GLOBAL_ROOT_NAMES = ["Автомобиль", "Отпуска", "Электроника"]
# Замена: старое имя -> имя новой категории (корневой или дочерней по имени).
REPLACEMENT_BY_OBSOLETE_ROOT = {
    "Автомобиль": "Личный транспорт",
    "Отпуска": "Путешествия",
    "Электроника": "Прочие расходы",
}


def get_descendant_ids(session: Session, category_id: int) -> list[int]:
    """Возвращает id самой категории и всех потомков (рекурсивно)."""
    ids = [category_id]
    child_ids = session.execute(
        select(Category.id).where(Category.parent_id == category_id)
    ).scalars().all()
    for child_id in child_ids:
        ids.extend(get_descendant_ids(session, child_id))
    return ids


def _find_global_root(session: Session, name: str):
    return session.execute(
        select(Category).where(
            Category.name == name,
            Category.parent_id.is_(None),
            Category.owner_user_id.is_(None),
        )
    ).scalar_one_or_none()


def _find_child_by_name(session: Session, parent_id: int, name: str):
    return session.execute(
        select(Category).where(
            Category.name == name,
            Category.parent_id == parent_id,
        )
    ).scalar_one_or_none()


def _obsolete_ids_in_delete_order(session: Session, obsolete_ids: set[int]) -> list[int]:
    """Порядок удаления: сначала листья (у кого нет детей в obsolete), затем их родители."""
    result = []
    remaining = set(obsolete_ids)
    while remaining:
        # Можно удалить тех, у кого нет детей в remaining
        next_batch = []
        for cid in remaining:
            has_child = session.execute(
                select(Category.id).where(
                    Category.parent_id == cid, Category.id.in_(remaining)
                )
            ).scalars().first()
            if has_child is None:
                next_batch.append(cid)
        for cid in next_batch:
            result.append(cid)
            remaining.discard(cid)
        if not next_batch and remaining:
            result.append(remaining.pop())
    return result


def delete_obsolete_globals(session: Session) -> None:
    """Переназначает ссылки на новые категории и удаляет устаревшие глобальные категории."""
    # 1) Найти id новых категорий (корни по имени)
    replacement_ids = {}
    for new_name in set(REPLACEMENT_BY_OBSOLETE_ROOT.values()):
        cat = _find_global_root(session, new_name)
        if cat:
            replacement_ids[new_name] = cat.id
    # Банковские комиссии — дочерняя у «Комиссии»
    komissii = _find_global_root(session, "Комиссии")
    if komissii:
        bank_comm = _find_child_by_name(session, komissii.id, "Банковские комиссии")
        if bank_comm:
            replacement_ids["Банковские комиссии"] = bank_comm.id

    # 2) Собрать все устаревшие id и сопоставление obsolete_id -> replacement_id
    obsolete_to_replacement: dict[int, int] = {}
    all_obsolete_ids: set[int] = set()

    for old_name in OBSOLETE_GLOBAL_ROOT_NAMES:
        cat = _find_global_root(session, old_name)
        if not cat:
            continue
        repl_name = REPLACEMENT_BY_OBSOLETE_ROOT.get(old_name)
        repl_id = replacement_ids.get(repl_name) if repl_name else None
        if not repl_id:
            print(f"  Пропуск {old_name}: не найдена замена {repl_name!r}")
            continue
        ids = get_descendant_ids(session, cat.id)
        for cid in ids:
            all_obsolete_ids.add(cid)
            obsolete_to_replacement[cid] = repl_id
        print(f"  Будет удалена: {old_name} (и потомки), замена -> {repl_name}")

    uslugi = _find_global_root(session, "Услуги")
    if uslugi:
        bank = _find_child_by_name(session, uslugi.id, "Банковское обслуживание")
        if bank:
            all_obsolete_ids.add(bank.id)
            repl_id = replacement_ids.get("Банковские комиссии")
            if repl_id:
                obsolete_to_replacement[bank.id] = repl_id
                print("  Будет удалена: Банковское обслуживание, замена -> Банковские комиссии")
            else:
                print("  Пропуск Банковское обслуживание: не найдена замена")

    if not all_obsolete_ids:
        print("  Нет устаревших категорий для удаления.")
        return

    # 3) Переназначить ссылки в транзакциях, цепочках, лимитах, целях
    for old_id, repl_id in obsolete_to_replacement.items():
        session.execute(update(Transaction).where(Transaction.category_id == old_id).values(category_id=repl_id))
        session.execute(update(TransactionChain).where(TransactionChain.category_id == old_id).values(category_id=repl_id))
        session.execute(update(Goal).where(Goal.category_id == old_id).values(category_id=repl_id))
    session.execute(delete(UserCategoryState).where(UserCategoryState.category_id.in_(all_obsolete_ids)))

    # 4) Удалить категории: сначала потомки, потом родители
    ordered = _obsolete_ids_in_delete_order(session, all_obsolete_ids)
    for cid in ordered:
        session.execute(delete(Category).where(Category.id == cid))
    print(f"  Удалено категорий: {len(ordered)}")


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
        icon_name = (
            normalize_icon(CATEGORY_ICON_BY_L1.get(name))
            if parent_id is None
            else normalize_icon(CATEGORY_ICON_BY_L2.get(name))
        )
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
        print("Сидирование дерева категорий...")
        seed_tree(session, CATEGORY_SEED, scope="BOTH", parent_id=None)
        session.flush()
        print("Удаление устаревших глобальных категорий...")
        delete_obsolete_globals(session)
        if args.dry_run:
            session.rollback()
        else:
            session.commit()
    finally:
        session.close()

    print("Seeded categories")
    if not args.dry_run:
        print("Перезапустите бэкенд (API), чтобы сбросить кэш категорий и увидеть новые категории в приложении.")


if __name__ == "__main__":
    main()
