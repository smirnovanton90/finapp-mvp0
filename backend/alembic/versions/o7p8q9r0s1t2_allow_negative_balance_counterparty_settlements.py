"""allow negative balance for counterparty_settlements

Revision ID: o7p8q9r0s1t2
Revises: n6o7p8q9r0s1
Create Date: 2026-01-31

"""
from typing import Sequence, Union

from alembic import op

revision: str = "o7p8q9r0s1t2"
down_revision: Union[str, Sequence[str], None] = "n6o7p8q9r0s1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_items_initial_non_negative", "items", type_="check")
    op.drop_constraint("ck_items_current_non_negative", "items", type_="check")
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


def downgrade() -> None:
    op.drop_constraint("ck_items_current_non_negative", "items", type_="check")
    op.drop_constraint("ck_items_initial_non_negative", "items", type_="check")
    op.create_check_constraint(
        "ck_items_initial_non_negative",
        "items",
        "(initial_value_rub >= 0) or (type_code = 'bank_card' and card_kind = 'CREDIT')",
    )
    op.create_check_constraint(
        "ck_items_current_non_negative",
        "items",
        "(current_value_rub >= 0) or (type_code = 'bank_card' and card_kind = 'CREDIT')",
    )
