"""add counterparty_id to transactions and chains

Revision ID: a3b4c5d6e7f8
Revises: f0a1b2c3d4e5
Create Date: 2026-01-07 21:05:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a3b4c5d6e7f8"
down_revision = "f0a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("counterparty_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "transaction_chains",
        sa.Column("counterparty_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_transactions_counterparty_id",
        "transactions",
        "counterparties",
        ["counterparty_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_transaction_chains_counterparty_id",
        "transaction_chains",
        "counterparties",
        ["counterparty_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_transaction_chains_counterparty_id",
        "transaction_chains",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_transactions_counterparty_id",
        "transactions",
        type_="foreignkey",
    )
    op.drop_column("transaction_chains", "counterparty_id")
    op.drop_column("transactions", "counterparty_id")
