"""enable automatic timezone detection by default

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-10-04

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d6e7f8a9b0c1"
down_revision: Union[str, Sequence[str], None] = "c5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "timezone_auto",
        existing_type=sa.Boolean(),
        existing_nullable=False,
        server_default=sa.true(),
    )
    op.execute(sa.text("UPDATE users SET timezone_auto = true"))


def downgrade() -> None:
    op.alter_column(
        "users",
        "timezone_auto",
        existing_type=sa.Boolean(),
        existing_nullable=False,
        server_default=sa.false(),
    )
