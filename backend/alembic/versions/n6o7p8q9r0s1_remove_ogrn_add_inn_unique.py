"""remove ogrn from counterparties, add inn unique constraint

Revision ID: n6o7p8q9r0s1
Revises: m5n6o7p8q9r0
Create Date: 2026-01-31

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "n6o7p8q9r0s1"
down_revision: Union[str, Sequence[str], None] = "m5n6o7p8q9r0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ux_counterparties_owner_ogrn", table_name="counterparties")
    op.drop_column("counterparties", "ogrn")
    op.execute(
        "CREATE UNIQUE INDEX ux_counterparties_owner_inn ON counterparties (owner_user_id, inn) WHERE inn IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_index("ux_counterparties_owner_inn", table_name="counterparties")
    op.add_column(
        "counterparties",
        sa.Column("ogrn", sa.String(15), nullable=True),
    )
    op.execute(
        "CREATE UNIQUE INDEX ux_counterparties_owner_ogrn ON counterparties (owner_user_id, ogrn) WHERE ogrn IS NOT NULL"
    )
