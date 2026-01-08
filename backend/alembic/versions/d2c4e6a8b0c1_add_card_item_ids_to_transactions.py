"""add card item ids to transactions and chains

Revision ID: d2c4e6a8b0c1
Revises: a3b4c5d6e7f8
Create Date: 2026-01-08 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d2c4e6a8b0c1"
down_revision = "a3b4c5d6e7f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("primary_card_item_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column("counterparty_card_item_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "transaction_chains",
        sa.Column("primary_card_item_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "transaction_chains",
        sa.Column("counterparty_card_item_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_transactions_primary_card_item_id",
        "transactions",
        "items",
        ["primary_card_item_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_transactions_counterparty_card_item_id",
        "transactions",
        "items",
        ["counterparty_card_item_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_transaction_chains_primary_card_item_id",
        "transaction_chains",
        "items",
        ["primary_card_item_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_transaction_chains_counterparty_card_item_id",
        "transaction_chains",
        "items",
        ["counterparty_card_item_id"],
        ["id"],
    )
    op.create_index(
        "ix_transactions_user_primary_card_item_id",
        "transactions",
        ["user_id", "primary_card_item_id"],
    )
    op.create_index(
        "ix_transactions_user_counterparty_card_item_id",
        "transactions",
        ["user_id", "counterparty_card_item_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_transactions_user_counterparty_card_item_id",
        table_name="transactions",
    )
    op.drop_index(
        "ix_transactions_user_primary_card_item_id",
        table_name="transactions",
    )
    op.drop_constraint(
        "fk_transaction_chains_counterparty_card_item_id",
        "transaction_chains",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_transaction_chains_primary_card_item_id",
        "transaction_chains",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_transactions_counterparty_card_item_id",
        "transactions",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_transactions_primary_card_item_id",
        "transactions",
        type_="foreignkey",
    )
    op.drop_column("transaction_chains", "counterparty_card_item_id")
    op.drop_column("transaction_chains", "primary_card_item_id")
    op.drop_column("transactions", "counterparty_card_item_id")
    op.drop_column("transactions", "primary_card_item_id")
