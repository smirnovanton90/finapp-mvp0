"""add fx rates table

Revision ID: a12b3c4d5e6f
Revises: f9d93f3a16ae
Create Date: 2025-03-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a12b3c4d5e6f"
down_revision: Union[str, Sequence[str], None] = "f9d93f3a16ae"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "fx_rates",
        sa.Column("rate_date", sa.Date(), nullable=False),
        sa.Column("char_code", sa.String(length=3), nullable=False),
        sa.Column("nominal", sa.Integer(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("rate", sa.Float(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("rate_date", "char_code"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("fx_rates")
