"""add source to item_balance_checkpoints

Revision ID: a9b0c1d2e3f5
Revises: b8c9d0e1f2a3
Create Date: 2026-03-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a9b0c1d2e3f5"
down_revision: Union[str, Sequence[str], None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "item_balance_checkpoints",
        sa.Column("source", sa.String(20), nullable=False, server_default="MANUAL"),
    )


def downgrade() -> None:
    op.drop_column("item_balance_checkpoints", "source")
