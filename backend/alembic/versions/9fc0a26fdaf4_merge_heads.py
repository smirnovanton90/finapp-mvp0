"""merge heads

Revision ID: 9fc0a26fdaf4
Revises: a12b3c4d5e6f, b1c2d3e4f5a6
Create Date: 2026-01-03 00:34:45.039224

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9fc0a26fdaf4'
down_revision: Union[str, Sequence[str], None] = ('a12b3c4d5e6f', 'b1c2d3e4f5a6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
