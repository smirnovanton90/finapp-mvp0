"""merge heads a4b5c6d7e8f9, w3x4y5z6a7b8 and add loan plan toggle columns if missing

Revision ID: b6c7d8e9f0a1
Revises: a4b5c6d7e8f9, w3x4y5z6a7b8
Create Date: 2026-03-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b6c7d8e9f0a1"
down_revision: Union[str, Sequence[str], None] = ("a4b5c6d7e8f9", "w3x4y5z6a7b8")
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
            sa.Column(
                "first_payment_interest_only",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )
    if not _column_exists("item_plan_settings", "skip_first_payment"):
        op.add_column(
            "item_plan_settings",
            sa.Column(
                "skip_first_payment",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )
    if not _column_exists("item_plan_settings", "shift_weekend_payment_to_workday"):
        op.add_column(
            "item_plan_settings",
            sa.Column(
                "shift_weekend_payment_to_workday",
                sa.Boolean(),
                nullable=False,
                server_default="true",
            ),
        )


def downgrade() -> None:
    if _column_exists("item_plan_settings", "shift_weekend_payment_to_workday"):
        op.drop_column("item_plan_settings", "shift_weekend_payment_to_workday")
    if _column_exists("item_plan_settings", "skip_first_payment"):
        op.drop_column("item_plan_settings", "skip_first_payment")
    if _column_exists("item_plan_settings", "first_payment_interest_only"):
        op.drop_column("item_plan_settings", "first_payment_interest_only")
