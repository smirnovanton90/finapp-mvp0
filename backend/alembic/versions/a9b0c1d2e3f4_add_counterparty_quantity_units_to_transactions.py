"""add counterparty_quantity_units to transactions (crypto transfers)

Revision ID: a9b0c1d2e3f4
Revises: w4x5y6z7a8b9
Create Date: 2026-03-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a9b0c1d2e3f4"
down_revision: Union[str, Sequence[str], None] = "w4x5y6z7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("counterparty_quantity_units", sa.Numeric(20, 10), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("transactions", "counterparty_quantity_units")
