"""rename_bank_id_to_counterparty_id

Revision ID: 282df6cb44f5
Revises: j1a2b3c4d5e6
Create Date: 2026-01-12 16:13:03.547864

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '282df6cb44f5'
down_revision: Union[str, Sequence[str], None] = 'j1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Rename bank_id column to counterparty_id in items table."""
    # Rename the column
    op.alter_column('items', 'bank_id', new_column_name='counterparty_id')
    # The foreign key constraint name might need to be updated, but typically
    # PostgreSQL will keep the same constraint name. If needed, we can rename it:
    # op.drop_constraint('fk_items_bank_id', 'items', type_='foreignkey')
    # op.create_foreign_key('fk_items_counterparty_id', 'items', 'counterparties', ['counterparty_id'], ['id'])


def downgrade() -> None:
    """Rename counterparty_id column back to bank_id in items table."""
    op.alter_column('items', 'counterparty_id', new_column_name='bank_id')
