"""add transaction indexes

Revision ID: f2a3b4c5d6e7
Revises: e2f3a4b5c6d7
Create Date: 2026-01-06 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "f2a3b4c5d6e7"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_transactions_user_deleted_date_id",
        "transactions",
        ["user_id", "deleted_at", "transaction_date", "id"],
    )
    op.create_index(
        "ix_transactions_user_category_id",
        "transactions",
        ["user_id", "category_id"],
    )
    op.create_index(
        "ix_transactions_user_primary_item_id",
        "transactions",
        ["user_id", "primary_item_id"],
    )
    op.create_index(
        "ix_transactions_user_counterparty_item_id",
        "transactions",
        ["user_id", "counterparty_item_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_transactions_user_counterparty_item_id", table_name="transactions")
    op.drop_index("ix_transactions_user_primary_item_id", table_name="transactions")
    op.drop_index("ix_transactions_user_category_id", table_name="transactions")
    op.drop_index("ix_transactions_user_deleted_date_id", table_name="transactions")
