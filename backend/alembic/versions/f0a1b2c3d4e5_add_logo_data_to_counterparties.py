"""add logo data to counterparties

Revision ID: f0a1b2c3d4e5
Revises: e4f5a6b7c8d9
Create Date: 2026-01-07 20:15:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "f0a1b2c3d4e5"
down_revision = "e4f5a6b7c8d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "counterparties", sa.Column("logo_mime", sa.String(length=50), nullable=True)
    )
    op.add_column(
        "counterparties", sa.Column("logo_data", sa.LargeBinary(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("counterparties", "logo_data")
    op.drop_column("counterparties", "logo_mime")
