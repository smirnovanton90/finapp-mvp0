"""add transaction status

Revision ID: f1c2b3d4e5f6
Revises: e3b1f7c9a2d4
Create Date: 2026-01-03 22:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f1c2b3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "e3b1f7c9a2d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "transactions",
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="CONFIRMED",
        ),
    )
    op.create_check_constraint(
        "ck_transactions_status",
        "transactions",
        "status in ('CONFIRMED','UNCONFIRMED')",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_transactions_status", "transactions", type_="check")
    op.drop_column("transactions", "status")
