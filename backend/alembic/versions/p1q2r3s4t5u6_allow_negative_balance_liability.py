"""allow negative balance for LIABILITY (loans, overpayment)

Revision ID: p1q2r3s4t5u6
Revises: b6c7d8e9f0a1, k4l5m6n7o8p9
Create Date: 2026-03-05

"""
from typing import Sequence, Union

from alembic import op


revision: str = "p1q2r3s4t5u6"
down_revision: Union[str, Sequence[str], None] = ("b6c7d8e9f0a1", "k4l5m6n7o8p9")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_items_initial_non_negative", "items", type_="check")
    op.drop_constraint("ck_items_current_non_negative", "items", type_="check")
    op.create_check_constraint(
        "ck_items_initial_non_negative",
        "items",
        "(initial_value_rub >= 0) or (type_code = 'bank_card' and card_kind = 'CREDIT') or (type_code = 'counterparty_settlements') or (kind = 'LIABILITY')",
    )
    op.create_check_constraint(
        "ck_items_current_non_negative",
        "items",
        "(current_value_rub >= 0) or (type_code = 'bank_card' and card_kind = 'CREDIT') or (type_code = 'counterparty_settlements') or (kind = 'LIABILITY')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_items_current_non_negative", "items", type_="check")
    op.drop_constraint("ck_items_initial_non_negative", "items", type_="check")
    op.create_check_constraint(
        "ck_items_initial_non_negative",
        "items",
        "(initial_value_rub >= 0) or (type_code = 'bank_card' and card_kind = 'CREDIT') or (type_code = 'counterparty_settlements')",
    )
    op.create_check_constraint(
        "ck_items_current_non_negative",
        "items",
        "(current_value_rub >= 0) or (type_code = 'bank_card' and card_kind = 'CREDIT') or (type_code = 'counterparty_settlements')",
    )
