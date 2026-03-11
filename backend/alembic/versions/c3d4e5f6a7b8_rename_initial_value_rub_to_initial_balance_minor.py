"""rename initial_value_rub to initial_balance_minor (начальный остаток в валюте актива)

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-11

"""
from typing import Sequence, Union

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "items",
        "initial_value_rub",
        new_column_name="initial_balance_minor",
    )


def downgrade() -> None:
    op.alter_column(
        "items",
        "initial_balance_minor",
        new_column_name="initial_value_rub",
    )
