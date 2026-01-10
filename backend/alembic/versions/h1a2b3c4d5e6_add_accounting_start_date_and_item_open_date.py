"""add accounting start date and item open date

Revision ID: h1a2b3c4d5e6
Revises: g4a1c2b3d4e5
Create Date: 2026-01-10 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(col["name"] == column for col in inspector.get_columns(table))


def _constraint_exists(name: str) -> bool:
    bind = op.get_bind()
    return (
        bind.execute(
            sa.text("select 1 from pg_constraint where conname = :name"),
            {"name": name},
        ).first()
        is not None
    )


# revision identifiers, used by Alembic.
revision = "h1a2b3c4d5e6"
down_revision = "g4a1c2b3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not _has_column("users", "accounting_start_date"):
        op.add_column(
            "users",
            sa.Column("accounting_start_date", sa.Date(), nullable=True),
        )

    if not _has_column("items", "open_date"):
        op.add_column("items", sa.Column("open_date", sa.Date(), nullable=True))
    if not _has_column("items", "history_status"):
        op.add_column(
            "items", sa.Column("history_status", sa.String(length=20), nullable=True)
        )
    if not _has_column("items", "opening_counterparty_item_id"):
        op.add_column(
            "items",
            sa.Column("opening_counterparty_item_id", sa.BigInteger(), nullable=True),
        )
    if not _constraint_exists("fk_items_opening_counterparty_item_id"):
        op.create_foreign_key(
            "fk_items_opening_counterparty_item_id",
            "items",
            "items",
            ["opening_counterparty_item_id"],
            ["id"],
        )
    if not _constraint_exists("ck_items_history_status"):
        op.create_check_constraint(
            "ck_items_history_status",
            "items",
            "history_status in ('NEW','HISTORICAL')",
        )

    if not _has_column("transactions", "linked_item_id"):
        op.add_column(
            "transactions",
            sa.Column("linked_item_id", sa.BigInteger(), nullable=True),
        )
    if not _has_column("transactions", "source"):
        op.add_column("transactions", sa.Column("source", sa.String(length=30), nullable=True))
    if not _constraint_exists("fk_transactions_linked_item_id"):
        op.create_foreign_key(
            "fk_transactions_linked_item_id",
            "transactions",
            "items",
            ["linked_item_id"],
            ["id"],
        )
    if not _constraint_exists("ck_transactions_source"):
        op.create_check_constraint(
            "ck_transactions_source",
            "transactions",
            "(source is null) or (source in ('AUTO_ITEM_OPENING','AUTO_ITEM_CLOSING','MANUAL'))",
        )

    op.execute("UPDATE items SET open_date = start_date WHERE open_date IS NULL")
    op.execute(
        """
        UPDATE users
           SET accounting_start_date = COALESCE(
                (SELECT MIN(start_date) FROM items WHERE items.user_id = users.id),
                CURRENT_DATE
           )
        """
    )
    op.execute(
        """
        UPDATE items
           SET start_date = (
                SELECT accounting_start_date FROM users WHERE users.id = items.user_id
           )
        """
    )
    op.execute(
        """
        UPDATE items
           SET history_status = CASE
               WHEN open_date > (SELECT accounting_start_date FROM users WHERE users.id = items.user_id)
               THEN 'NEW'
               ELSE 'HISTORICAL'
           END
        """
    )

    if _has_column("items", "open_date"):
        op.alter_column("items", "open_date", nullable=False)
    if _has_column("items", "history_status"):
        op.alter_column("items", "history_status", nullable=False)


def downgrade() -> None:
    op.drop_constraint("ck_transactions_source", "transactions", type_="check")
    op.drop_constraint(
        "fk_transactions_linked_item_id", "transactions", type_="foreignkey"
    )
    op.drop_column("transactions", "source")
    op.drop_column("transactions", "linked_item_id")

    op.drop_constraint("ck_items_history_status", "items", type_="check")
    op.drop_constraint(
        "fk_items_opening_counterparty_item_id", "items", type_="foreignkey"
    )
    op.drop_column("items", "opening_counterparty_item_id")
    op.drop_column("items", "history_status")
    op.drop_column("items", "open_date")

    op.drop_column("users", "accounting_start_date")
