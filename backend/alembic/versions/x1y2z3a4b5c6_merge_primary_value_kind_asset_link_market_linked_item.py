"""merge: primary_value_kind, asset_link_type, item_market_values, linked_item_id migration

Replaces: v4w5x6y7z8a9, w6x7y8z9a0b1, z9a0b1c2d3e4, a0b1c2d3e4f5, b1c2d3e4f5a6 (c2d3e4f5a6b7)

Revision ID: x1y2z3a4b5c6
Revises: u2v3w4x5y6z7
Create Date: 2026-02-20

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = "x1y2z3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "u2v3w4x5y6z7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. items.primary_value_kind
    conn.execute(
        text("ALTER TABLE items ADD COLUMN IF NOT EXISTS primary_value_kind VARCHAR(20) NULL")
    )
    r = conn.execute(
        text(
            """
            SELECT 1 FROM pg_constraint
            WHERE conname = 'ck_items_primary_value_kind'
              AND conrelid = 'public.items'::regclass
            LIMIT 1
            """
        )
    )
    if r.fetchone() is None:
        op.create_check_constraint(
            "ck_items_primary_value_kind",
            "items",
            "(primary_value_kind is null) or (primary_value_kind in ('BALANCE','ACQUISITION','INVESTED','MARKET'))",
        )

    # 2. transactions.asset_link_type (сразу расширенный список значений)
    conn.execute(
        text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS asset_link_type VARCHAR(30) NULL")
    )
    conn.execute(text("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS ck_transactions_asset_link_type"))
    conn.execute(
        text(
            """
            ALTER TABLE transactions ADD CONSTRAINT ck_transactions_asset_link_type
            CHECK (
                (asset_link_type IS NULL) OR (asset_link_type IN (
                    'ASSET_PURCHASE','ASSET_INVESTMENT','ASSET_EXPENSE',
                    'ASSET_SALE','ASSET_INCOME',
                    'ASSET_RELATED_INCOME','ASSET_RELATED_EXPENSE','ACQUISITION_EXPENSE'
                ))
            )
            """
        )
    )

    # 3. item_market_values (создаём только если таблицы ещё нет)
    r = conn.execute(
        text(
            "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'item_market_values' LIMIT 1"
        )
    )
    if r.fetchone() is None:
        op.create_table(
            "item_market_values",
            sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("item_id", sa.BigInteger(), nullable=False),
            sa.Column("value_date", sa.Date(), nullable=False),
            sa.Column("value_rub", sa.BigInteger(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_item_market_values_item_id",
            "item_market_values",
            ["item_id"],
            unique=False,
        )
        op.create_index(
            "ix_item_market_values_user_id",
            "item_market_values",
            ["user_id"],
            unique=False,
        )
        op.create_index(
            "ix_item_market_values_item_id_value_date",
            "item_market_values",
            ["item_id", "value_date"],
            unique=True,
        )

    # 4. Перенос linked_item_id -> related_item_id и удаление linked_item_id
    op.execute(
        text(
            """
            UPDATE transactions
            SET related_item_id = linked_item_id
            WHERE related_item_id IS NULL AND linked_item_id IS NOT NULL
            """
        )
    )
    op.execute(
        text(
            """
            UPDATE transaction_chains
            SET related_item_id = linked_item_id
            WHERE related_item_id IS NULL AND linked_item_id IS NOT NULL
            """
        )
    )

    op.drop_constraint(
        "fk_transactions_linked_item_id",
        "transactions",
        type_="foreignkey",
    )
    op.drop_index("ix_transactions_linked_item_id", "transactions", if_exists=True)
    op.drop_column("transactions", "linked_item_id")

    op.drop_constraint(
        "fk_transaction_chains_linked_item_id",
        "transaction_chains",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_transaction_chains_linked_item_id",
        "transaction_chains",
        if_exists=True,
    )
    op.drop_column("transaction_chains", "linked_item_id")


def downgrade() -> None:
    conn = op.get_bind()

    # 4. Вернуть linked_item_id
    op.add_column(
        "transaction_chains",
        sa.Column("linked_item_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_transaction_chains_linked_item_id",
        "transaction_chains",
        "items",
        ["linked_item_id"],
        ["id"],
    )
    op.create_index(
        "ix_transaction_chains_linked_item_id",
        "transaction_chains",
        ["linked_item_id"],
        unique=False,
    )
    op.execute(
        text(
            """
            UPDATE transaction_chains
            SET linked_item_id = related_item_id
            WHERE linked_item_id IS NULL AND related_item_id IS NOT NULL
            """
        )
    )

    op.add_column(
        "transactions",
        sa.Column("linked_item_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_transactions_linked_item_id",
        "transactions",
        "items",
        ["linked_item_id"],
        ["id"],
    )
    op.create_index(
        "ix_transactions_linked_item_id",
        "transactions",
        ["linked_item_id"],
        unique=False,
    )
    op.execute(
        text(
            """
            UPDATE transactions
            SET linked_item_id = related_item_id
            WHERE linked_item_id IS NULL AND related_item_id IS NOT NULL
            """
        )
    )

    # 3. Удалить item_market_values
    op.drop_index("ix_item_market_values_item_id_value_date", "item_market_values")
    op.drop_index("ix_item_market_values_user_id", "item_market_values")
    op.drop_index("ix_item_market_values_item_id", "item_market_values")
    op.drop_table("item_market_values")

    # 2. Удалить asset_link_type
    conn.execute(text("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS ck_transactions_asset_link_type"))
    conn.execute(text("ALTER TABLE transactions DROP COLUMN IF EXISTS asset_link_type"))

    # 1. Удалить primary_value_kind
    conn.execute(text("ALTER TABLE items DROP CONSTRAINT IF EXISTS ck_items_primary_value_kind"))
    conn.execute(text("ALTER TABLE items DROP COLUMN IF EXISTS primary_value_kind"))
