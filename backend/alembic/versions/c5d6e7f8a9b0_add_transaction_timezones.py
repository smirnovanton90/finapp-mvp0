"""add user and transaction timezones

Revision ID: c5d6e7f8a9b0
Revises: k9l0m1n2o3p4
Create Date: 2026-10-04

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, Sequence[str], None] = "k9l0m1n2o3p4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    row = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :table AND column_name = :column"
        ),
        {"table": table, "column": column},
    )
    return row.scalar() is not None


def _index_exists(index_name: str) -> bool:
    bind = op.get_bind()
    row = bind.execute(
        sa.text("SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = :name"),
        {"name": index_name},
    )
    return row.scalar() is not None


def upgrade() -> None:
    if not _column_exists("users", "timezone"):
        op.add_column(
            "users",
            sa.Column(
                "timezone",
                sa.String(length=64),
                nullable=False,
                server_default="Europe/Moscow",
            ),
        )
    if not _column_exists("users", "timezone_auto"):
        op.add_column(
            "users",
            sa.Column(
                "timezone_auto",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )
    if not _column_exists("users", "timezone_detected"):
        op.add_column(
            "users",
            sa.Column("timezone_detected", sa.String(length=64), nullable=True),
        )
    if not _column_exists("transactions", "timezone"):
        op.add_column(
            "transactions",
            sa.Column(
                "timezone",
                sa.String(length=64),
                nullable=False,
                server_default="Europe/Moscow",
            ),
        )
    if not _column_exists("transactions", "balance_applied"):
        op.add_column(
            "transactions",
            sa.Column(
                "balance_applied",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )
    if not _index_exists("ix_transactions_user_balance_applied"):
        op.create_index(
            "ix_transactions_user_balance_applied",
            "transactions",
            ["user_id", "balance_applied"],
        )


def downgrade() -> None:
    op.drop_index("ix_transactions_user_balance_applied", table_name="transactions")
    op.drop_column("transactions", "balance_applied")
    op.drop_column("transactions", "timezone")
    op.drop_column("users", "timezone_detected")
    op.drop_column("users", "timezone_auto")
    op.drop_column("users", "timezone")
