"""add deleted_at to transaction chains

Revision ID: 8a9b0c1d2e3f
Revises: 7e8f9a0b1c2d
Create Date: 2026-01-04 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8a9b0c1d2e3f"
down_revision: Union[str, Sequence[str], None] = "7e8f9a0b1c2d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transaction_chains",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("transaction_chains", "deleted_at")
