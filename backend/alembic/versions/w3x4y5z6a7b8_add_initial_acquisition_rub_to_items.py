"""add initial_acquisition_rub to items (historical MARKET acquisition cost)

Revision ID: w3x4y5z6a7b8
Revises: v7w8x9y0z1a2
Create Date: 2026-02-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "w3x4y5z6a7b8"
down_revision: Union[str, Sequence[str], None] = "v7w8x9y0z1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "items",
        sa.Column("initial_acquisition_rub", sa.BigInteger(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("items", "initial_acquisition_rub")
