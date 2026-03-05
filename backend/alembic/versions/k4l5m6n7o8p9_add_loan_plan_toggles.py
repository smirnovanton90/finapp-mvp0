"""add loan plan toggles: first_payment_interest_only, skip_first_payment, shift_weekend_payment_to_workday

Revision ID: k4l5m6n7o8p9
Revises: i3c4d5e6f7g8
Create Date: 2026-03-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "k4l5m6n7o8p9"
down_revision: Union[str, Sequence[str], None] = "i3c4d5e6f7g8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return False
    r = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return r.scalar() is not None


def upgrade() -> None:
    if not _column_exists("item_plan_settings", "first_payment_interest_only"):
        op.add_column(
            "item_plan_settings",
            sa.Column("first_payment_interest_only", sa.Boolean(), nullable=False, server_default="false"),
        )
    if not _column_exists("item_plan_settings", "skip_first_payment"):
        op.add_column(
            "item_plan_settings",
            sa.Column("skip_first_payment", sa.Boolean(), nullable=False, server_default="false"),
        )
    if not _column_exists("item_plan_settings", "shift_weekend_payment_to_workday"):
        op.add_column(
            "item_plan_settings",
            sa.Column("shift_weekend_payment_to_workday", sa.Boolean(), nullable=False, server_default="true"),
        )


def downgrade() -> None:
    op.drop_column("item_plan_settings", "shift_weekend_payment_to_workday")
    op.drop_column("item_plan_settings", "skip_first_payment")
    op.drop_column("item_plan_settings", "first_payment_interest_only")
