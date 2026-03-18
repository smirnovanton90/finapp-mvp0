"""add opening_deals to items (MOEX deal breakdown)

Revision ID: a7b8c9d0e1f2
Revises: j5k6l7m8n9o0
Create Date: 2026-03-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "j5k6l7m8n9o0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "items",
        sa.Column("opening_deals", JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("items", "opening_deals")
