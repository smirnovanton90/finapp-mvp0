"""add price_usd_cents to market_prices for crypto (USD) display

Revision ID: a4b5c6d7e8f9
Revises: m5n6o7p8q9r0
Create Date: 2026-02-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a4b5c6d7e8f9"
down_revision: Union[str, Sequence[str], None] = "m5n6o7p8q9r0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "market_prices",
        sa.Column("price_usd_cents", sa.BigInteger(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("market_prices", "price_usd_cents")
