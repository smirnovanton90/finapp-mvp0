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


def upgrade() -> None:
    op.add_column(
        "item_plan_settings",
        sa.Column("first_payment_interest_only", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "item_plan_settings",
        sa.Column("skip_first_payment", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "item_plan_settings",
        sa.Column("shift_weekend_payment_to_workday", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("item_plan_settings", "shift_weekend_payment_to_workday")
    op.drop_column("item_plan_settings", "skip_first_payment")
    op.drop_column("item_plan_settings", "first_payment_interest_only")
