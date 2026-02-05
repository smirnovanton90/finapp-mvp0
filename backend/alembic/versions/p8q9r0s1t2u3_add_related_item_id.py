"""add related_item_id to transactions and transaction_chains

Revision ID: p8q9r0s1t2u3
Revises: o7p8q9r0s1t2
Create Date: 2026-02-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "p8q9r0s1t2u3"
down_revision: Union[str, Sequence[str], None] = "o7p8q9r0s1t2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("related_item_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_transactions_related_item_id",
        "transactions",
        "items",
        ["related_item_id"],
        ["id"],
    )
    op.create_index(
        "ix_transactions_related_item_id",
        "transactions",
        ["related_item_id"],
        unique=False,
    )

    op.add_column(
        "transaction_chains",
        sa.Column("related_item_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_transaction_chains_related_item_id",
        "transaction_chains",
        "items",
        ["related_item_id"],
        ["id"],
    )
    op.create_index(
        "ix_transaction_chains_related_item_id",
        "transaction_chains",
        ["related_item_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_transaction_chains_related_item_id", "transaction_chains")
    op.drop_constraint(
        "fk_transaction_chains_related_item_id",
        "transaction_chains",
        type_="foreignkey",
    )
    op.drop_column("transaction_chains", "related_item_id")

    op.drop_index("ix_transactions_related_item_id", "transactions")
    op.drop_constraint(
        "fk_transactions_related_item_id",
        "transactions",
        type_="foreignkey",
    )
    op.drop_column("transactions", "related_item_id")
