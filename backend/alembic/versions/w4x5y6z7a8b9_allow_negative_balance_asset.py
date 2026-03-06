"""allow negative balance for ASSET (сальдо активов может быть отрицательным)

Revision ID: w4x5y6z7a8b9
Revises: q2r3s4t5u6v7
Create Date: 2026-03-06

"""
from typing import Sequence, Union

from alembic import op


revision: str = "w4x5y6z7a8b9"
down_revision: Union[str, None] = "q2r3s4t5u6v7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_items_initial_non_negative", "items", type_="check")
    op.drop_constraint("ck_items_current_non_negative", "items", type_="check")
    # Не создаём новые ограничения — сальдо активов и обязательств может быть отрицательным


def downgrade() -> None:
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
