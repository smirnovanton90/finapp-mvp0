"""add item financial details

Revision ID: e3b1f7c9a2d4
Revises: d8e4a0b1c2d3
Create Date: 2026-01-03 19:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e3b1f7c9a2d4"
down_revision: Union[str, Sequence[str], None] = "d8e4a0b1c2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("items", sa.Column("open_date", sa.Date(), nullable=True))
    op.add_column("items", sa.Column("card_last4", sa.String(length=4), nullable=True))
    op.add_column("items", sa.Column("card_account_id", sa.BigInteger(), nullable=True))
    op.add_column("items", sa.Column("deposit_term_days", sa.Integer(), nullable=True))
    op.add_column("items", sa.Column("deposit_end_date", sa.Date(), nullable=True))
    op.add_column("items", sa.Column("interest_rate", sa.Float(), nullable=True))
    op.add_column("items", sa.Column("interest_payout_order", sa.String(length=20), nullable=True))
    op.add_column("items", sa.Column("interest_capitalization", sa.Boolean(), nullable=True))
    op.add_column("items", sa.Column("interest_payout_account_id", sa.BigInteger(), nullable=True))

    op.create_foreign_key(
        "fk_items_card_account_id",
        "items",
        "items",
        ["card_account_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_items_interest_payout_account_id",
        "items",
        "items",
        ["interest_payout_account_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_items_interest_payout_account_id", "items", type_="foreignkey")
    op.drop_constraint("fk_items_card_account_id", "items", type_="foreignkey")
    op.drop_column("items", "interest_payout_account_id")
    op.drop_column("items", "interest_capitalization")
    op.drop_column("items", "interest_payout_order")
    op.drop_column("items", "interest_rate")
    op.drop_column("items", "deposit_end_date")
    op.drop_column("items", "deposit_term_days")
    op.drop_column("items", "card_account_id")
    op.drop_column("items", "card_last4")
    op.drop_column("items", "open_date")
