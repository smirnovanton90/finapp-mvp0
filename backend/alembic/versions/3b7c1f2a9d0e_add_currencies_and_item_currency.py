"""add currencies and item currency_code

Revision ID: 3b7c1f2a9d0e
Revises: 4f607b998664
Create Date: 2026-01-02 21:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3b7c1f2a9d0e"
down_revision: Union[str, Sequence[str], None] = "4f607b998664"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    tables = set(inspector.get_table_names(schema="public"))
    if "currencies" not in tables:
        op.create_table(
            "currencies",
            sa.Column("iso_char_code", sa.String(length=3), nullable=False),
            sa.Column("iso_num_code", sa.String(length=3), nullable=False),
            sa.Column("nominal", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("eng_name", sa.String(length=200), nullable=False),
            sa.Column(
                "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
            ),
            sa.PrimaryKeyConstraint("iso_char_code"),
        )

    op.execute(
        """
        insert into currencies (iso_char_code, iso_num_code, nominal, name, eng_name)
        values ('RUB', '643', 1, 'Российский рубль', 'Russian Ruble')
        on conflict (iso_char_code) do nothing
        """
    )

    item_columns = {col["name"] for col in inspector.get_columns("items")}
    if "currency_code" not in item_columns:
        op.add_column(
            "items",
            sa.Column("currency_code", sa.String(length=3), server_default="RUB", nullable=False),
        )
        op.alter_column("items", "currency_code", server_default=None)

    op.execute("update items set currency_code = 'RUB' where currency_code is null")

    item_fks = {fk.get("name") for fk in inspector.get_foreign_keys("items")}
    if "fk_items_currency_code" not in item_fks:
        op.create_foreign_key(
            "fk_items_currency_code",
            "items",
            "currencies",
            ["currency_code"],
            ["iso_char_code"],
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_items_currency_code", "items", type_="foreignkey")
    op.drop_column("items", "currency_code")
    op.drop_table("currencies")
