"""add value_currency_cents to item_market_values (store market value in asset currency)

Revision ID: v7w8x9y0z1a2
Revises: z3a4b5c6d7e8
Create Date: 2026-02-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = "v7w8x9y0z1a2"
down_revision: Union[str, Sequence[str], None] = "z3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "item_market_values",
        sa.Column("value_currency_cents", sa.BigInteger(), nullable=True),
    )
    # For existing rows where item is RUB, set value_currency_cents = value_rub
    conn = op.get_bind()
    conn.execute(
        text("""
            UPDATE item_market_values mv
            SET value_currency_cents = mv.value_rub
            FROM items i
            WHERE mv.item_id = i.id
              AND (i.currency_code IS NULL OR UPPER(TRIM(i.currency_code)) = 'RUB')
        """)
    )


def downgrade() -> None:
    op.drop_column("item_market_values", "value_currency_cents")
