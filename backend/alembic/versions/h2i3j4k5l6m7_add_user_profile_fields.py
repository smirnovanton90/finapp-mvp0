"""add user profile fields

Revision ID: h2i3j4k5l6m7
Revises: g1h2i3j4k5l6
Create Date: 2026-01-09 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "h2i3j4k5l6m7"
down_revision = "g1h2i3j4k5l6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("first_name", sa.String(length=100), nullable=True)
    )
    op.add_column(
        "users", sa.Column("last_name", sa.String(length=100), nullable=True)
    )
    op.add_column(
        "users", sa.Column("birth_date", sa.Date(), nullable=True)
    )
    op.add_column(
        "users", sa.Column("photo_url", sa.Text(), nullable=True)
    )
    op.add_column(
        "users", sa.Column("photo_mime", sa.String(length=50), nullable=True)
    )
    op.add_column(
        "users", sa.Column("photo_data", sa.LargeBinary(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("users", "photo_data")
    op.drop_column("users", "photo_mime")
    op.drop_column("users", "photo_url")
    op.drop_column("users", "birth_date")
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
