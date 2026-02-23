"""add quantity_units to items, primary_quantity_units to transactions (CoinGecko crypto)

Revision ID: z3a4b5c6d7e8
Revises: y2z3a4b5c6d7
Create Date: 2026-02-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "z3a4b5c6d7e8"
down_revision: Union[str, Sequence[str], None] = "y2z3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "items",
        sa.Column("quantity_units", sa.Numeric(20, 10), nullable=True),
    )
    op.create_check_constraint(
        "ck_items_quantity_units_non_negative",
        "items",
        "(quantity_units is null) or (quantity_units >= 0)",
    )
    op.add_column(
        "transactions",
        sa.Column("primary_quantity_units", sa.Numeric(20, 10), nullable=True),
    )


def downgrade() -> None:
    op.drop_constraint("ck_items_quantity_units_non_negative", "items", type_="check")
    op.drop_column("items", "quantity_units")
    op.drop_column("transactions", "primary_quantity_units")
