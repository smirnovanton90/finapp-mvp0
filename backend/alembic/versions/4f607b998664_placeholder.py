"""placeholder for missing revision

Revision ID: 4f607b998664
Revises: cee01bb4abb2
Create Date: 2026-01-02 22:05:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "4f607b998664"
down_revision: Union[str, Sequence[str], None] = "cee01bb4abb2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Missing migration placeholder. No-op.
    op.execute("-- placeholder revision 4f607b998664")


def downgrade() -> None:
    """Downgrade schema."""
    # No-op.
    op.execute("-- placeholder revision 4f607b998664")
