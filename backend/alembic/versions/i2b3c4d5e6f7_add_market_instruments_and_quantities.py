"""add market instruments, prices, and transaction quantities

Revision ID: i2b3c4d5e6f7
Revises: h1a2b3c4d5e6
Create Date: 2026-01-10 20:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "i2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "h1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "market_instruments",
        sa.Column("secid", sa.String(length=50), primary_key=True),
        sa.Column("provider", sa.String(length=20), nullable=False, server_default="MOEX"),
        sa.Column("isin", sa.String(length=20), nullable=True),
        sa.Column("short_name", sa.String(length=200), nullable=True),
        sa.Column("name", sa.String(length=300), nullable=True),
        sa.Column("type_code", sa.String(length=50), nullable=True),
        sa.Column("engine", sa.String(length=50), nullable=True),
        sa.Column("market", sa.String(length=50), nullable=True),
        sa.Column("default_board_id", sa.String(length=20), nullable=True),
        sa.Column("currency_code", sa.String(length=3), nullable=True),
        sa.Column("lot_size", sa.Integer(), nullable=True),
        sa.Column("face_value_cents", sa.BigInteger(), nullable=True),
        sa.Column("is_traded", sa.Boolean(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("provider", "secid", name="ux_market_instruments_provider_secid"),
    )

    op.create_table(
        "market_prices",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("instrument_id", sa.String(length=50), nullable=False),
        sa.Column("board_id", sa.String(length=20), nullable=False),
        sa.Column("price_date", sa.Date(), nullable=False),
        sa.Column("price_time", sa.DateTime(), nullable=True),
        sa.Column("price_cents", sa.BigInteger(), nullable=True),
        sa.Column("price_percent_bp", sa.Integer(), nullable=True),
        sa.Column("accint_cents", sa.BigInteger(), nullable=True),
        sa.Column("yield_bp", sa.Integer(), nullable=True),
        sa.Column("currency_code", sa.String(length=3), nullable=True),
        sa.Column("source", sa.String(length=30), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["instrument_id"], ["market_instruments.secid"]),
        sa.UniqueConstraint(
            "instrument_id",
            "board_id",
            "price_date",
            name="ux_market_prices_instrument_board_date",
        ),
    )

    op.add_column("items", sa.Column("instrument_id", sa.String(length=50), nullable=True))
    op.add_column("items", sa.Column("instrument_board_id", sa.String(length=20), nullable=True))
    op.add_column("items", sa.Column("position_lots", sa.BigInteger(), nullable=True))
    op.add_column("items", sa.Column("lot_size", sa.Integer(), nullable=True))
    op.add_column("items", sa.Column("face_value_cents", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_items_instrument_id",
        "items",
        "market_instruments",
        ["instrument_id"],
        ["secid"],
    )
    op.create_check_constraint(
        "ck_items_position_lots_non_negative",
        "items",
        "(position_lots is null) or (position_lots >= 0)",
    )

    op.add_column(
        "transactions", sa.Column("primary_quantity_lots", sa.BigInteger(), nullable=True)
    )
    op.add_column(
        "transactions",
        sa.Column("counterparty_quantity_lots", sa.BigInteger(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("transactions", "counterparty_quantity_lots")
    op.drop_column("transactions", "primary_quantity_lots")

    op.drop_constraint("ck_items_position_lots_non_negative", "items", type_="check")
    op.drop_constraint("fk_items_instrument_id", "items", type_="foreignkey")
    op.drop_column("items", "face_value_cents")
    op.drop_column("items", "lot_size")
    op.drop_column("items", "position_lots")
    op.drop_column("items", "instrument_board_id")
    op.drop_column("items", "instrument_id")

    op.drop_table("market_prices")
    op.drop_table("market_instruments")
