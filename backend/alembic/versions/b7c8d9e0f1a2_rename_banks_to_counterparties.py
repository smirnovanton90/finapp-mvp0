"""rename banks to counterparties

Revision ID: b7c8d9e0f1a2
Revises: 5e45f5344ed9
Create Date: 2026-01-07 18:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, Sequence[str], None] = "5e45f5344ed9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.rename_table("banks", "counterparties")
    op.add_column(
        "counterparties",
        sa.Column("entity_type", sa.String(length=10), nullable=False, server_default="LEGAL"),
    )
    op.add_column(
        "counterparties",
        sa.Column("is_bank", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("counterparties", sa.Column("full_name", sa.String(length=300), nullable=True))
    op.add_column(
        "counterparties", sa.Column("legal_form", sa.String(length=200), nullable=True)
    )
    op.add_column("counterparties", sa.Column("inn", sa.String(length=12), nullable=True))
    op.add_column(
        "counterparties", sa.Column("first_name", sa.String(length=100), nullable=True)
    )
    op.add_column(
        "counterparties", sa.Column("last_name", sa.String(length=100), nullable=True)
    )
    op.add_column(
        "counterparties", sa.Column("middle_name", sa.String(length=100), nullable=True)
    )
    op.add_column(
        "counterparties", sa.Column("owner_user_id", sa.BigInteger(), nullable=True)
    )
    op.add_column(
        "counterparties",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.alter_column(
        "counterparties",
        "ogrn",
        existing_type=sa.String(length=13),
        type_=sa.String(length=15),
        nullable=True,
    )
    op.alter_column(
        "counterparties",
        "license_status",
        existing_type=sa.String(length=40),
        nullable=True,
    )

    op.execute("UPDATE counterparties SET entity_type='LEGAL', is_bank=TRUE")

    op.drop_constraint("fk_items_bank_id", "items", type_="foreignkey")
    op.create_foreign_key(
        "fk_items_bank_id", "items", "counterparties", ["bank_id"], ["id"]
    )
    op.create_foreign_key(
        "fk_counterparties_owner_user_id",
        "counterparties",
        "users",
        ["owner_user_id"],
        ["id"],
    )
    op.create_check_constraint(
        "ck_counterparties_entity_type",
        "counterparties",
        "entity_type in ('LEGAL','PERSON')",
    )
    op.create_check_constraint(
        "ck_counterparties_bank_legal",
        "counterparties",
        "(not is_bank) or entity_type = 'LEGAL'",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "ck_counterparties_bank_legal", "counterparties", type_="check"
    )
    op.drop_constraint(
        "ck_counterparties_entity_type", "counterparties", type_="check"
    )
    op.drop_constraint(
        "fk_counterparties_owner_user_id", "counterparties", type_="foreignkey"
    )
    op.drop_constraint("fk_items_bank_id", "items", type_="foreignkey")

    op.alter_column(
        "counterparties",
        "license_status",
        existing_type=sa.String(length=40),
        nullable=False,
    )
    op.alter_column(
        "counterparties",
        "ogrn",
        existing_type=sa.String(length=15),
        type_=sa.String(length=13),
        nullable=False,
    )

    op.drop_column("counterparties", "deleted_at")
    op.drop_column("counterparties", "owner_user_id")
    op.drop_column("counterparties", "middle_name")
    op.drop_column("counterparties", "last_name")
    op.drop_column("counterparties", "first_name")
    op.drop_column("counterparties", "inn")
    op.drop_column("counterparties", "legal_form")
    op.drop_column("counterparties", "full_name")
    op.drop_column("counterparties", "is_bank")
    op.drop_column("counterparties", "entity_type")
    op.rename_table("counterparties", "banks")
    op.create_foreign_key("fk_items_bank_id", "items", "banks", ["bank_id"], ["id"])
