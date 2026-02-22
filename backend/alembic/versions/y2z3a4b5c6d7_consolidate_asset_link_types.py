"""Consolidate asset link types: merge ACQUISITION_EXPENSE, ASSET_RELATED_*, into 5 types

Revision ID: y2z3a4b5c6d7
Revises: x1y2z3a4b5c6
Create Date: 2026-02-21

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "y2z3a4b5c6d7"
down_revision: Union[str, Sequence[str], None] = "x1y2z3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    # Переводим старые значения в целевые
    conn.execute(
        text("UPDATE transactions SET asset_link_type = 'ASSET_PURCHASE' WHERE asset_link_type = 'ACQUISITION_EXPENSE'")
    )
    conn.execute(
        text("UPDATE transactions SET asset_link_type = 'ASSET_EXPENSE' WHERE asset_link_type = 'ASSET_RELATED_EXPENSE'")
    )
    conn.execute(
        text("UPDATE transactions SET asset_link_type = 'ASSET_INCOME' WHERE asset_link_type = 'ASSET_RELATED_INCOME'")
    )
    # Обновляем ограничение: только 5 типов
    conn.execute(text("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS ck_transactions_asset_link_type"))
    conn.execute(
        text(
            """
            ALTER TABLE transactions ADD CONSTRAINT ck_transactions_asset_link_type
            CHECK (
                (asset_link_type IS NULL) OR (asset_link_type IN (
                    'ASSET_PURCHASE','ASSET_INVESTMENT','ASSET_EXPENSE',
                    'ASSET_SALE','ASSET_INCOME'
                ))
            )
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
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
    # В downgrade не откатываем данные: бывшие ACQUISITION_EXPENSE останутся ASSET_PURCHASE
