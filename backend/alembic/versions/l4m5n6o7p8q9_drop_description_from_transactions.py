"""drop description from transactions and transaction_chains

Revision ID: l4m5n6o7p8q9
Revises: k3l4m5n6o7p8
Create Date: 2026-01-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "l4m5n6o7p8q9"
down_revision: Union[str, Sequence[str], None] = "k3l4m5n6o7p8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("transactions", "description")
    op.drop_column("transaction_chains", "description")


def downgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("description", sa.Text(), nullable=True),
    )
    op.add_column(
        "transaction_chains",
        sa.Column("description", sa.Text(), nullable=True),
    )
