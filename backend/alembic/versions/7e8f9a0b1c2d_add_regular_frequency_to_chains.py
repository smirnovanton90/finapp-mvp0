"""add regular frequency to chains

Revision ID: 7e8f9a0b1c2d
Revises: 5b7f2c1a3d4e
Create Date: 2026-01-04 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7e8f9a0b1c2d"
down_revision: Union[str, Sequence[str], None] = "5b7f2c1a3d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("transaction_chains", sa.Column("interval_days", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_transaction_chains_interval_days",
        "transaction_chains",
        "(interval_days is null) or (interval_days >= 1)",
    )

    op.drop_constraint(
        "ck_transaction_chains_frequency",
        "transaction_chains",
        type_="check",
    )
    op.create_check_constraint(
        "ck_transaction_chains_frequency",
        "transaction_chains",
        "frequency in ('DAILY','WEEKLY','MONTHLY','REGULAR')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_transaction_chains_frequency",
        "transaction_chains",
        type_="check",
    )
    op.create_check_constraint(
        "ck_transaction_chains_frequency",
        "transaction_chains",
        "frequency in ('DAILY','WEEKLY','MONTHLY')",
    )

    op.drop_constraint(
        "ck_transaction_chains_interval_days",
        "transaction_chains",
        type_="check",
    )
    op.drop_column("transaction_chains", "interval_days")
