"""add item_balance_checkpoints table

Revision ID: b8c9d0e1f2a3
Revises: k5l6m7n8o9p0
Create Date: 2026-03-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "k5l6m7n8o9p0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "item_balance_checkpoints",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("item_id", sa.BigInteger(), nullable=False),
        sa.Column("checkpoint_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stated_balance_cents", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_item_balance_checkpoints_item_id", "item_balance_checkpoints", ["item_id"])
    op.create_index("ix_item_balance_checkpoints_user_id_item_id", "item_balance_checkpoints", ["user_id", "item_id"])


def downgrade() -> None:
    op.drop_index("ix_item_balance_checkpoints_user_id_item_id", table_name="item_balance_checkpoints")
    op.drop_index("ix_item_balance_checkpoints_item_id", table_name="item_balance_checkpoints")
    op.drop_table("item_balance_checkpoints")
