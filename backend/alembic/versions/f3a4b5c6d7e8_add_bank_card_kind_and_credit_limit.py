"""add bank card kind and credit limit

Revision ID: f3a4b5c6d7e8
Revises: d2c4e6a8b0c1
Create Date: 2026-01-08 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, Sequence[str], None] = "d2c4e6a8b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("items", sa.Column("card_kind", sa.String(length=10), nullable=True))
    op.add_column("items", sa.Column("credit_limit", sa.BigInteger(), nullable=True))

    op.execute(
        "UPDATE items SET card_kind = 'DEBIT' "
        "WHERE type_code = 'bank_card' AND card_kind IS NULL"
    )

    op.execute(
        """
        UPDATE items
        SET
            type_code = 'bank_card',
            kind = 'ASSET',
            card_kind = 'CREDIT',
            initial_value_rub = -initial_value_rub,
            current_value_rub = -current_value_rub,
            credit_limit = CASE
                WHEN ABS(initial_value_rub) > ABS(current_value_rub)
                    THEN ABS(initial_value_rub)
                ELSE ABS(current_value_rub)
            END
        WHERE type_code = 'credit_card_debt'
        """
    )

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
    op.create_check_constraint(
        "ck_items_card_kind",
        "items",
        "card_kind is null or card_kind in ('DEBIT','CREDIT')",
    )
    op.create_check_constraint(
        "ck_items_credit_limit_non_negative",
        "items",
        "credit_limit is null or credit_limit >= 0",
    )
    op.create_check_constraint(
        "ck_items_credit_limit_required",
        "items",
        "(card_kind != 'CREDIT') or (credit_limit is not null)",
    )
    op.create_check_constraint(
        "ck_items_credit_limit_only_credit",
        "items",
        "(card_kind = 'CREDIT') or (credit_limit is null)",
    )
    op.create_check_constraint(
        "ck_items_card_kind_only_bank_card",
        "items",
        "card_kind is null or type_code = 'bank_card'",
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE items
        SET
            type_code = 'credit_card_debt',
            kind = 'LIABILITY',
            initial_value_rub = ABS(initial_value_rub),
            current_value_rub = ABS(current_value_rub)
        WHERE type_code = 'bank_card' AND card_kind = 'CREDIT'
        """
    )

    op.drop_constraint("ck_items_card_kind_only_bank_card", "items", type_="check")
    op.drop_constraint("ck_items_credit_limit_only_credit", "items", type_="check")
    op.drop_constraint("ck_items_credit_limit_required", "items", type_="check")
    op.drop_constraint("ck_items_credit_limit_non_negative", "items", type_="check")
    op.drop_constraint("ck_items_card_kind", "items", type_="check")
    op.drop_constraint("ck_items_current_non_negative", "items", type_="check")
    op.drop_constraint("ck_items_initial_non_negative", "items", type_="check")
    op.create_check_constraint(
        "ck_items_initial_non_negative",
        "items",
        "initial_value_rub >= 0",
    )
    op.create_check_constraint(
        "ck_items_current_non_negative",
        "items",
        "current_value_rub >= 0",
    )

    op.drop_column("items", "credit_limit")
    op.drop_column("items", "card_kind")
