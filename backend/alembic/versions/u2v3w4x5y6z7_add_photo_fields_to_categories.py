"""add photo fields to categories

Revision ID: u2v3w4x5y6z7
Revises: t1u2v3w4x5y6
Create Date: 2026-02-15

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "u2v3w4x5y6z7"
down_revision: Union[str, Sequence[str], None] = "t1u2v3w4x5y6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column("photo_url", sa.Text(), nullable=True),
    )
    op.add_column(
        "categories",
        sa.Column("photo_mime", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "categories",
        sa.Column("photo_data", sa.LargeBinary(), nullable=True),
    )
    op.add_column(
        "categories",
        sa.Column("photo_updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("categories", "photo_updated_at")
    op.drop_column("categories", "photo_data")
    op.drop_column("categories", "photo_mime")
    op.drop_column("categories", "photo_url")
