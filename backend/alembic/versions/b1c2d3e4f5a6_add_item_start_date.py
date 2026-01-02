"""add item start_date

Revision ID: b1c2d3e4f5a6
Revises: 8b9a2d3d5c01
Create Date: 2026-01-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "8b9a2d3d5c01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "items",
        sa.Column(
            "start_date",
            sa.Date(),
            server_default=sa.text("CURRENT_DATE"),
            nullable=False,
        ),
    )
    op.execute("update items set start_date = DATE(created_at)")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("items", "start_date")
