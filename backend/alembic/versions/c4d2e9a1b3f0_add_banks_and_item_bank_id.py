"""add banks and item bank_id

Revision ID: c4d2e9a1b3f0
Revises: 9fc0a26fdaf4
Create Date: 2026-01-03 15:42:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4d2e9a1b3f0"
down_revision: Union[str, Sequence[str], None] = "9fc0a26fdaf4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "banks",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("ogrn", sa.String(length=13), nullable=False, unique=True),
        sa.Column("name", sa.String(length=300), nullable=False),
        sa.Column("license_status", sa.String(length=40), nullable=False),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.add_column("items", sa.Column("bank_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key("fk_items_bank_id", "items", "banks", ["bank_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_items_bank_id", "items", type_="foreignkey")
    op.drop_column("items", "bank_id")
    op.drop_table("banks")
