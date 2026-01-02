"""add transfer amount_counterparty

Revision ID: 8b9a2d3d5c01
Revises: 3b7c1f2a9d0e
Create Date: 2026-01-02 23:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8b9a2d3d5c01"
down_revision: Union[str, Sequence[str], None] = "3b7c1f2a9d0e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("transactions", sa.Column("amount_counterparty", sa.BigInteger(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("transactions", "amount_counterparty")
