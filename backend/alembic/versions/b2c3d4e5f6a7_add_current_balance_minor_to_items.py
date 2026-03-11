"""add current_balance_minor to items (balance in asset currency)

Revision ID: b2c3d4e5f6a7
Revises: a9b0c1d2e3f5
Create Date: 2026-03-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a9b0c1d2e3f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "items",
        sa.Column("current_balance_minor", sa.BigInteger(), nullable=True),
    )
    # Migration: RUB items — current_balance_minor = current_value_rub; non-RUB — current_balance_minor = current_value_rub (already in currency in DB)
    op.execute(
        """
        UPDATE items
        SET current_balance_minor = current_value_rub
        WHERE current_balance_minor IS NULL
        """
    )
    op.alter_column(
        "items",
        "current_balance_minor",
        existing_type=sa.BigInteger(),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column("items", "current_balance_minor")
