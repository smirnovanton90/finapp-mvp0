"""add realized transaction status

Revision ID: 9b1c2d3e4f5a
Revises: 8a9b0c1d2e3f
Create Date: 2026-01-04 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9b1c2d3e4f5a"
down_revision: Union[str, Sequence[str], None] = "8a9b0c1d2e3f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_transactions_status", "transactions", type_="check")
    op.create_check_constraint(
        "ck_transactions_status",
        "transactions",
        "status in ('CONFIRMED','UNCONFIRMED','REALIZED')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_transactions_status", "transactions", type_="check")
    op.create_check_constraint(
        "ck_transactions_status",
        "transactions",
        "status in ('CONFIRMED','UNCONFIRMED')",
    )
