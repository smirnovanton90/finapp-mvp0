"""add photo fields to items

Revision ID: j2k3l4m5n6o7
Revises: h2i3j4k5l6m7
Create Date: 2026-01-27

"""

from alembic import op
import sqlalchemy as sa

revision = "j2k3l4m5n6o7"
down_revision = "h2i3j4k5l6m7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "items", sa.Column("photo_mime", sa.String(length=50), nullable=True)
    )
    op.add_column(
        "items", sa.Column("photo_data", sa.LargeBinary(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("items", "photo_data")
    op.drop_column("items", "photo_mime")
