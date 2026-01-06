"""add categories and category_id references

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
Create Date: 2026-01-05 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from category_seed_data import CATEGORY_ICON_BY_L1, CATEGORY_SEED


# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "c0d1e2f3a4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def normalize_name(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip()
    if not cleaned or cleaned == "-":
        return None
    return cleaned


def normalize_icon(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip()
    return cleaned or None


def seed_categories(conn) -> dict[tuple[int | None, int | None, str], int]:
    categories = sa.table(
        "categories",
        sa.column("id", sa.BigInteger()),
        sa.column("name", sa.String()),
        sa.column("parent_id", sa.BigInteger()),
        sa.column("scope", sa.String()),
        sa.column("icon_name", sa.String()),
        sa.column("owner_user_id", sa.BigInteger()),
        sa.column("archived_at", sa.DateTime()),
    )

    def insert_category(
        name: str,
        scope: str,
        parent_id: int | None,
        owner_user_id: int | None,
        icon_name: str | None,
    ) -> int:
        existing = conn.execute(
            sa.select(categories.c.id).where(
                categories.c.name == name,
                categories.c.parent_id == parent_id,
                categories.c.owner_user_id.is_(owner_user_id),
            )
        ).scalar_one_or_none()
        if existing:
            return existing
        result = conn.execute(
            sa.insert(categories)
            .values(
                name=name,
                scope=scope,
                parent_id=parent_id,
                owner_user_id=owner_user_id,
                icon_name=icon_name,
            )
            .returning(categories.c.id)
        )
        return result.scalar_one()

    cache: dict[tuple[int | None, int | None, str], int] = {}

    def walk(items: list[dict], scope: str, parent_id: int | None) -> None:
        for item in items:
            name = item["name"].strip()
            node_scope = item.get("scope", scope)
            icon_name = (
                normalize_icon(CATEGORY_ICON_BY_L1.get(name)) if parent_id is None else None
            )
            category_id = insert_category(
                name=name,
                scope=node_scope,
                parent_id=parent_id,
                owner_user_id=None,
                icon_name=icon_name,
            )
            cache[(None, parent_id, name)] = category_id
            children = item.get("children") or []
            if children:
                walk(children, node_scope, category_id)

    walk(CATEGORY_SEED, "BOTH", None)
    return cache


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("parent_id", sa.BigInteger(), nullable=True),
        sa.Column("scope", sa.String(length=10), nullable=False),
        sa.Column("icon_name", sa.String(length=50), nullable=True),
        sa.Column("owner_user_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["parent_id"], ["categories.id"]),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"]),
        sa.CheckConstraint(
            "scope in ('INCOME','EXPENSE','BOTH')", name="ck_categories_scope"
        ),
    )
    op.create_table(
        "user_category_state",
        sa.Column("user_id", sa.BigInteger(), primary_key=True),
        sa.Column("category_id", sa.BigInteger(), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("icon_override", sa.String(length=50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"]),
    )

    op.add_column("transactions", sa.Column("category_id", sa.BigInteger(), nullable=True))
    op.add_column(
        "transaction_chains", sa.Column("category_id", sa.BigInteger(), nullable=True)
    )
    op.create_foreign_key(
        "fk_transactions_category_id",
        "transactions",
        "categories",
        ["category_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_transaction_chains_category_id",
        "transaction_chains",
        "categories",
        ["category_id"],
        ["id"],
    )

    conn = op.get_bind()
    cache = seed_categories(conn)

    categories = sa.table(
        "categories",
        sa.column("id", sa.BigInteger()),
        sa.column("name", sa.String()),
        sa.column("parent_id", sa.BigInteger()),
        sa.column("scope", sa.String()),
        sa.column("owner_user_id", sa.BigInteger()),
        sa.column("archived_at", sa.DateTime()),
    )

    def ensure_category(
        user_id: int,
        name: str,
        parent_id: int | None,
        scope: str,
    ) -> int:
        key = (user_id, parent_id, name)
        if key in cache:
            return cache[key]

        global_key = (None, parent_id, name)
        if global_key in cache:
            return cache[global_key]

        existing = conn.execute(
            sa.select(categories.c.id).where(
                categories.c.name == name,
                categories.c.parent_id == parent_id,
                categories.c.owner_user_id == user_id,
            )
        ).scalar_one_or_none()
        if existing:
            cache[key] = existing
            return existing

        result = conn.execute(
            sa.insert(categories)
            .values(
                name=name,
                scope=scope,
                parent_id=parent_id,
                owner_user_id=user_id,
            )
            .returning(categories.c.id)
        )
        category_id = result.scalar_one()
        cache[key] = category_id
        return category_id

    transactions = sa.table(
        "transactions",
        sa.column("id", sa.BigInteger()),
        sa.column("user_id", sa.BigInteger()),
        sa.column("direction", sa.String()),
        sa.column("category_l1", sa.String()),
        sa.column("category_l2", sa.String()),
        sa.column("category_l3", sa.String()),
        sa.column("category_id", sa.BigInteger()),
    )
    tx_rows = conn.execute(
        sa.select(
            transactions.c.id,
            transactions.c.user_id,
            transactions.c.direction,
            transactions.c.category_l1,
            transactions.c.category_l2,
            transactions.c.category_l3,
        )
    ).all()

    for row in tx_rows:
        if row.direction == "TRANSFER":
            category_id = None
        else:
            l1 = normalize_name(row.category_l1)
            l2 = normalize_name(row.category_l2)
            l3 = normalize_name(row.category_l3)
            if not l1:
                category_id = None
            else:
                scope = "INCOME" if row.direction == "INCOME" else "EXPENSE"
                current_id = ensure_category(row.user_id, l1, None, scope)
                if l2:
                    current_id = ensure_category(row.user_id, l2, current_id, scope)
                    if l3:
                        current_id = ensure_category(row.user_id, l3, current_id, scope)
                category_id = current_id

        conn.execute(
            transactions.update()
            .where(transactions.c.id == row.id)
            .values(category_id=category_id)
        )

    chains = sa.table(
        "transaction_chains",
        sa.column("id", sa.BigInteger()),
        sa.column("user_id", sa.BigInteger()),
        sa.column("direction", sa.String()),
        sa.column("category_l1", sa.String()),
        sa.column("category_l2", sa.String()),
        sa.column("category_l3", sa.String()),
        sa.column("category_id", sa.BigInteger()),
    )
    chain_rows = conn.execute(
        sa.select(
            chains.c.id,
            chains.c.user_id,
            chains.c.direction,
            chains.c.category_l1,
            chains.c.category_l2,
            chains.c.category_l3,
        )
    ).all()

    for row in chain_rows:
        if row.direction == "TRANSFER":
            category_id = None
        else:
            l1 = normalize_name(row.category_l1)
            l2 = normalize_name(row.category_l2)
            l3 = normalize_name(row.category_l3)
            if not l1:
                category_id = None
            else:
                scope = "INCOME" if row.direction == "INCOME" else "EXPENSE"
                current_id = ensure_category(row.user_id, l1, None, scope)
                if l2:
                    current_id = ensure_category(row.user_id, l2, current_id, scope)
                    if l3:
                        current_id = ensure_category(row.user_id, l3, current_id, scope)
                category_id = current_id

        conn.execute(
            chains.update().where(chains.c.id == row.id).values(category_id=category_id)
        )

    with op.batch_alter_table("transactions") as batch_op:
        batch_op.drop_column("category_l1")
        batch_op.drop_column("category_l2")
        batch_op.drop_column("category_l3")

    with op.batch_alter_table("transaction_chains") as batch_op:
        batch_op.drop_column("category_l1")
        batch_op.drop_column("category_l2")
        batch_op.drop_column("category_l3")


def downgrade() -> None:
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.add_column(sa.Column("category_l1", sa.String(length=100), nullable=False, server_default="-"))
        batch_op.add_column(sa.Column("category_l2", sa.String(length=100), nullable=False, server_default="-"))
        batch_op.add_column(sa.Column("category_l3", sa.String(length=100), nullable=False, server_default="-"))
        batch_op.drop_constraint("fk_transactions_category_id", type_="foreignkey")
        batch_op.drop_column("category_id")

    with op.batch_alter_table("transaction_chains") as batch_op:
        batch_op.add_column(sa.Column("category_l1", sa.String(length=100), nullable=False, server_default="-"))
        batch_op.add_column(sa.Column("category_l2", sa.String(length=100), nullable=False, server_default="-"))
        batch_op.add_column(sa.Column("category_l3", sa.String(length=100), nullable=False, server_default="-"))
        batch_op.drop_constraint("fk_transaction_chains_category_id", type_="foreignkey")
        batch_op.drop_column("category_id")

    op.drop_table("user_category_state")
    op.drop_table("categories")
