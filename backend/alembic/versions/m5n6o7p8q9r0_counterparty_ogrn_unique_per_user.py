"""counterparty ogrn unique per user (owner_user_id, ogrn)

Revision ID: m5n6o7p8q9r0
Revises: l4m5n6o7p8q9
Create Date: 2026-01-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "m5n6o7p8q9r0"
down_revision: Union[str, Sequence[str], None] = "l4m5n6o7p8q9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop global unique on ogrn (legacy banks_ogrn_key)
    op.drop_constraint("banks_ogrn_key", "counterparties", type_="unique")
    # Per-user uniqueness: (owner_user_id, ogrn) when ogrn is not null
    op.execute(
        "CREATE UNIQUE INDEX ux_counterparties_owner_ogrn ON counterparties (owner_user_id, ogrn) WHERE ogrn IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_index("ux_counterparties_owner_ogrn", table_name="counterparties")
    op.create_unique_constraint("banks_ogrn_key", "counterparties", ["ogrn"])
