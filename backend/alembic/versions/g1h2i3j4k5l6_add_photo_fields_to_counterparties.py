"""add photo fields to counterparties

Revision ID: g1h2i3j4k5l6
Revises: f0a1b2c3d4e5
Create Date: 2026-01-08 10:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "g1h2i3j4k5l6"
down_revision = "282df6cb44f5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # photo_url может уже существовать, поэтому используем IF NOT EXISTS через raw SQL
    op.execute("ALTER TABLE counterparties ADD COLUMN IF NOT EXISTS photo_url TEXT")
    op.add_column(
        "counterparties", sa.Column("photo_mime", sa.String(length=50), nullable=True)
    )
    op.add_column(
        "counterparties", sa.Column("photo_data", sa.LargeBinary(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("counterparties", "photo_data")
    op.drop_column("counterparties", "photo_mime")
