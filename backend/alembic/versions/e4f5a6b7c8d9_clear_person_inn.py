"""clear INN for person counterparties

Revision ID: e4f5a6b7c8d9
Revises: d1a2b3c4d5e6
Create Date: 2026-01-07 19:40:00.000000

"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "e4f5a6b7c8d9"
down_revision = "d1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE counterparties SET inn = NULL WHERE entity_type = 'PERSON'")


def downgrade() -> None:
    pass
