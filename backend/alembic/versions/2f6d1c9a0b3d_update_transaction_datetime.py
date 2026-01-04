"""update transaction_date to datetime

Revision ID: 2f6d1c9a0b3d
Revises: f1c2b3d4e5f6
Create Date: 2026-01-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2f6d1c9a0b3d"
down_revision: Union[str, Sequence[str], None] = "f1c2b3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.alter_column(
            "transaction_date",
            existing_type=sa.Date(),
            type_=sa.DateTime(),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.alter_column(
            "transaction_date",
            existing_type=sa.DateTime(),
            type_=sa.Date(),
            existing_nullable=False,
        )
