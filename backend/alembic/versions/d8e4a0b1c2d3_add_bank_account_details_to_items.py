"""add bank account details to items

Revision ID: d8e4a0b1c2d3
Revises: c4d2e9a1b3f0
Create Date: 2026-01-03 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d8e4a0b1c2d3"
down_revision: Union[str, Sequence[str], None] = "c4d2e9a1b3f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("items", sa.Column("account_last7", sa.String(length=7), nullable=True))
    op.add_column("items", sa.Column("contract_number", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("items", "contract_number")
    op.drop_column("items", "account_last7")
