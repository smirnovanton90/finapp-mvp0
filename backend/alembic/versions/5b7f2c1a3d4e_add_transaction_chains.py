"""add transaction chains

Revision ID: 5b7f2c1a3d4e
Revises: 2f6d1c9a0b3d
Create Date: 2026-01-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5b7f2c1a3d4e"
down_revision: Union[str, Sequence[str], None] = "2f6d1c9a0b3d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "transaction_chains",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("frequency", sa.String(length=20), nullable=False),
        sa.Column("weekly_day", sa.Integer(), nullable=True),
        sa.Column("monthly_day", sa.Integer(), nullable=True),
        sa.Column("monthly_rule", sa.String(length=20), nullable=True),
        sa.Column("primary_item_id", sa.BigInteger(), nullable=False),
        sa.Column("counterparty_item_id", sa.BigInteger(), nullable=True),
        sa.Column("amount_rub", sa.BigInteger(), nullable=False),
        sa.Column("amount_counterparty", sa.BigInteger(), nullable=True),
        sa.Column("direction", sa.String(length=20), nullable=False),
        sa.Column("category_l1", sa.String(length=100), nullable=False),
        sa.Column("category_l2", sa.String(length=100), nullable=False),
        sa.Column("category_l3", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "frequency in ('DAILY','WEEKLY','MONTHLY')",
            name="ck_transaction_chains_frequency",
        ),
        sa.CheckConstraint(
            "direction in ('INCOME','EXPENSE','TRANSFER')",
            name="ck_transaction_chains_direction",
        ),
        sa.CheckConstraint(
            "amount_rub >= 0",
            name="ck_transaction_chains_amount_non_negative",
        ),
        sa.CheckConstraint(
            "(weekly_day is null) or (weekly_day between 0 and 6)",
            name="ck_transaction_chains_weekly_day_range",
        ),
        sa.CheckConstraint(
            "(monthly_day is null) or (monthly_day between 1 and 31)",
            name="ck_transaction_chains_monthly_day_range",
        ),
        sa.CheckConstraint(
            "(monthly_rule is null) or (monthly_rule in ('FIRST_DAY','LAST_DAY'))",
            name="ck_transaction_chains_monthly_rule",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["primary_item_id"], ["items.id"]),
        sa.ForeignKeyConstraint(["counterparty_item_id"], ["items.id"]),
    )

    op.add_column("transactions", sa.Column("chain_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_transactions_chain_id",
        "transactions",
        "transaction_chains",
        ["chain_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_transactions_chain_id", "transactions", type_="foreignkey")
    op.drop_column("transactions", "chain_id")
    op.drop_table("transaction_chains")
