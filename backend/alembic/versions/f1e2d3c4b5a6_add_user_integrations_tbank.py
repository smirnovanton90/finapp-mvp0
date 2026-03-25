"""add user_integrations broker_account_links broker_imported_operations TBANK_IMPORT

Revision ID: f1e2d3c4b5a6
Revises: a7b8c9d0e1f2
Create Date: 2025-03-24

"""
from alembic import op
import sqlalchemy as sa


revision = "f1e2d3c4b5a6"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_integrations",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("token_ciphertext", sa.Text(), nullable=True),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("sandbox", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "provider", name="ux_user_integrations_user_provider"),
    )
    op.create_index("ix_user_integrations_user_id", "user_integrations", ["user_id"])

    op.create_table(
        "broker_account_links",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("integration_id", sa.BigInteger(), nullable=False),
        sa.Column("external_account_id", sa.String(length=100), nullable=False),
        sa.Column("item_id", sa.BigInteger(), nullable=True),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column("account_type_hint", sa.String(length=80), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["integration_id"], ["user_integrations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "integration_id",
            "external_account_id",
            name="ux_broker_account_links_integration_external",
        ),
    )
    op.create_index(
        "ix_broker_account_links_integration_id",
        "broker_account_links",
        ["integration_id"],
    )

    op.create_table(
        "broker_imported_operations",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("integration_id", sa.BigInteger(), nullable=False),
        sa.Column("external_operation_id", sa.String(length=120), nullable=False),
        sa.Column("transaction_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["integration_id"], ["user_integrations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "integration_id",
            "external_operation_id",
            name="ux_broker_imported_ops_integration_extid",
        ),
    )
    op.create_index(
        "ix_broker_imported_operations_integration_id",
        "broker_imported_operations",
        ["integration_id"],
    )

    op.create_table(
        "broker_position_links",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("integration_id", sa.BigInteger(), nullable=False),
        sa.Column("external_account_id", sa.String(length=100), nullable=False),
        sa.Column("figi", sa.String(length=50), nullable=False),
        sa.Column("item_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["integration_id"], ["user_integrations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "integration_id",
            "external_account_id",
            "figi",
            name="ux_broker_position_links_integration_account_figi",
        ),
    )
    op.create_index(
        "ix_broker_position_links_integration_id",
        "broker_position_links",
        ["integration_id"],
    )

    op.drop_constraint("ck_transactions_source", "transactions", type_="check")
    op.execute(
        """
        UPDATE transactions SET source = NULL
        WHERE source IS NOT NULL AND source NOT IN (
            'AUTO_ITEM_OPENING','AUTO_ITEM_CLOSING','AUTO_ITEM_COMMISSION','MANUAL','TBANK_IMPORT'
        );
        """
    )
    op.create_check_constraint(
        "ck_transactions_source",
        "transactions",
        "(source IS NULL) OR (source IN ("
        "'AUTO_ITEM_OPENING','AUTO_ITEM_CLOSING','AUTO_ITEM_COMMISSION','MANUAL','TBANK_IMPORT'"
        "))",
    )


def downgrade() -> None:
    op.drop_index("ix_broker_position_links_integration_id", table_name="broker_position_links")
    op.drop_table("broker_position_links")
    op.drop_index("ix_broker_imported_operations_integration_id", table_name="broker_imported_operations")
    op.drop_table("broker_imported_operations")
    op.drop_index("ix_broker_account_links_integration_id", table_name="broker_account_links")
    op.drop_table("broker_account_links")
    op.drop_index("ix_user_integrations_user_id", table_name="user_integrations")
    op.drop_table("user_integrations")

    op.drop_constraint("ck_transactions_source", "transactions", type_="check")
    op.create_check_constraint(
        "ck_transactions_source",
        "transactions",
        "(source IS NULL) OR (source IN ("
        "'AUTO_ITEM_OPENING','AUTO_ITEM_CLOSING','AUTO_ITEM_COMMISSION','MANUAL'"
        "))",
    )
