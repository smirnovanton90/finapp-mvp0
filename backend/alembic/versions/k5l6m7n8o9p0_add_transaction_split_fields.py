"""add transaction split fields (parent_transaction_id, is_split_parent)

Revision ID: k5l6m7n8o9p0
Revises: a9b0c1d2e3f4
Create Date: 2026-03-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "k5l6m7n8o9p0"
down_revision: Union[str, Sequence[str], None] = "a9b0c1d2e3f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("parent_transaction_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column("is_split_parent", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_foreign_key(
        "fk_transactions_parent_transaction_id",
        "transactions",
        "transactions",
        ["parent_transaction_id"],
        ["id"],
    )
    op.create_index(
        "ix_transactions_parent_transaction_id",
        "transactions",
        ["parent_transaction_id"],
    )
    op.create_index(
        "ix_transactions_is_split_parent",
        "transactions",
        ["is_split_parent"],
    )


def downgrade() -> None:
    op.drop_index("ix_transactions_is_split_parent", table_name="transactions")
    op.drop_index("ix_transactions_parent_transaction_id", table_name="transactions")
    op.drop_constraint(
        "fk_transactions_parent_transaction_id",
        "transactions",
        type_="foreignkey",
    )
    op.drop_column("transactions", "is_split_parent")
    op.drop_column("transactions", "parent_transaction_id")
