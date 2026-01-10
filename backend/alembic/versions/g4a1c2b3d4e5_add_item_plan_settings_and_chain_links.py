"""add item plan settings and chain links

Revision ID: g4a1c2b3d4e5
Revises: f3a4b5c6d7e8
Create Date: 2026-01-08 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "g4a1c2b3d4e5"
down_revision = "f3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "item_plan_settings",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("item_id", sa.BigInteger(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("first_payout_rule", sa.String(length=20), nullable=True),
        sa.Column("plan_end_date", sa.Date(), nullable=True),
        sa.Column("loan_end_date", sa.Date(), nullable=True),
        sa.Column("repayment_frequency", sa.String(length=20), nullable=True),
        sa.Column("repayment_weekly_day", sa.Integer(), nullable=True),
        sa.Column("repayment_monthly_day", sa.Integer(), nullable=True),
        sa.Column("repayment_monthly_rule", sa.String(length=20), nullable=True),
        sa.Column("repayment_interval_days", sa.Integer(), nullable=True),
        sa.Column(
            "repayment_account_id",
            sa.BigInteger(),
            sa.ForeignKey("items.id"),
            nullable=True,
        ),
        sa.Column("repayment_type", sa.String(length=20), nullable=True),
        sa.Column("payment_amount_kind", sa.String(length=20), nullable=True),
        sa.Column("payment_amount_rub", sa.BigInteger(), nullable=True),
    )
    op.create_index(
        "ix_item_plan_settings_item_id", "item_plan_settings", ["item_id"], unique=True
    )
    op.create_check_constraint(
        "ck_item_plan_settings_first_payout_rule",
        "item_plan_settings",
        "(first_payout_rule is null) or (first_payout_rule in ('OPEN_DATE','MONTH_END','SHIFT_ONE_MONTH'))",
    )
    op.create_check_constraint(
        "ck_item_plan_settings_repayment_frequency",
        "item_plan_settings",
        "(repayment_frequency is null) or (repayment_frequency in ('DAILY','WEEKLY','MONTHLY','REGULAR'))",
    )
    op.create_check_constraint(
        "ck_item_plan_settings_weekly_day_range",
        "item_plan_settings",
        "(repayment_weekly_day is null) or (repayment_weekly_day between 0 and 6)",
    )
    op.create_check_constraint(
        "ck_item_plan_settings_monthly_day_range",
        "item_plan_settings",
        "(repayment_monthly_day is null) or (repayment_monthly_day between 1 and 31)",
    )
    op.create_check_constraint(
        "ck_item_plan_settings_monthly_rule",
        "item_plan_settings",
        "(repayment_monthly_rule is null) or (repayment_monthly_rule in ('FIRST_DAY','LAST_DAY'))",
    )
    op.create_check_constraint(
        "ck_item_plan_settings_interval_days",
        "item_plan_settings",
        "(repayment_interval_days is null) or (repayment_interval_days >= 1)",
    )
    op.create_check_constraint(
        "ck_item_plan_settings_repayment_type",
        "item_plan_settings",
        "(repayment_type is null) or (repayment_type in ('ANNUITY','DIFFERENTIATED'))",
    )
    op.create_check_constraint(
        "ck_item_plan_settings_payment_amount_kind",
        "item_plan_settings",
        "(payment_amount_kind is null) or (payment_amount_kind in ('TOTAL','PRINCIPAL'))",
    )
    op.create_check_constraint(
        "ck_item_plan_settings_payment_amount_non_negative",
        "item_plan_settings",
        "(payment_amount_rub is null) or (payment_amount_rub >= 0)",
    )

    op.add_column(
        "transaction_chains",
        sa.Column("linked_item_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "transaction_chains",
        sa.Column("source", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "transaction_chains",
        sa.Column("purpose", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "transaction_chains",
        sa.Column(
            "amount_is_variable", sa.Boolean(), nullable=False, server_default="false"
        ),
    )
    op.add_column(
        "transaction_chains",
        sa.Column("amount_min_rub", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "transaction_chains",
        sa.Column("amount_max_rub", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_transaction_chains_linked_item_id",
        "transaction_chains",
        "items",
        ["linked_item_id"],
        ["id"],
    )
    op.create_index(
        "ix_transaction_chains_linked_item_id",
        "transaction_chains",
        ["linked_item_id"],
    )
    op.create_check_constraint(
        "ck_transaction_chains_source",
        "transaction_chains",
        "(source is null) or (source in ('AUTO_ITEM','MANUAL'))",
    )
    op.create_check_constraint(
        "ck_transaction_chains_purpose",
        "transaction_chains",
        "(purpose is null) or (purpose in ('INTEREST','PRINCIPAL'))",
    )
    op.create_check_constraint(
        "ck_transaction_chains_amount_min_non_negative",
        "transaction_chains",
        "(amount_min_rub is null) or (amount_min_rub >= 0)",
    )
    op.create_check_constraint(
        "ck_transaction_chains_amount_max_non_negative",
        "transaction_chains",
        "(amount_max_rub is null) or (amount_max_rub >= 0)",
    )
    op.execute("UPDATE transaction_chains SET source = 'MANUAL' WHERE source IS NULL")


def downgrade() -> None:
    op.drop_check_constraint(
        "ck_transaction_chains_amount_max_non_negative",
        "transaction_chains",
        type_="check",
    )
    op.drop_check_constraint(
        "ck_transaction_chains_amount_min_non_negative",
        "transaction_chains",
        type_="check",
    )
    op.drop_check_constraint(
        "ck_transaction_chains_purpose",
        "transaction_chains",
        type_="check",
    )
    op.drop_check_constraint(
        "ck_transaction_chains_source",
        "transaction_chains",
        type_="check",
    )
    op.drop_index(
        "ix_transaction_chains_linked_item_id",
        table_name="transaction_chains",
    )
    op.drop_constraint(
        "fk_transaction_chains_linked_item_id",
        "transaction_chains",
        type_="foreignkey",
    )
    op.drop_column("transaction_chains", "amount_max_rub")
    op.drop_column("transaction_chains", "amount_min_rub")
    op.drop_column("transaction_chains", "amount_is_variable")
    op.drop_column("transaction_chains", "purpose")
    op.drop_column("transaction_chains", "source")
    op.drop_column("transaction_chains", "linked_item_id")

    op.drop_check_constraint(
        "ck_item_plan_settings_payment_amount_non_negative",
        "item_plan_settings",
        type_="check",
    )
    op.drop_check_constraint(
        "ck_item_plan_settings_payment_amount_kind",
        "item_plan_settings",
        type_="check",
    )
    op.drop_check_constraint(
        "ck_item_plan_settings_repayment_type",
        "item_plan_settings",
        type_="check",
    )
    op.drop_check_constraint(
        "ck_item_plan_settings_interval_days",
        "item_plan_settings",
        type_="check",
    )
    op.drop_check_constraint(
        "ck_item_plan_settings_monthly_rule",
        "item_plan_settings",
        type_="check",
    )
    op.drop_check_constraint(
        "ck_item_plan_settings_monthly_day_range",
        "item_plan_settings",
        type_="check",
    )
    op.drop_check_constraint(
        "ck_item_plan_settings_weekly_day_range",
        "item_plan_settings",
        type_="check",
    )
    op.drop_check_constraint(
        "ck_item_plan_settings_repayment_frequency",
        "item_plan_settings",
        type_="check",
    )
    op.drop_check_constraint(
        "ck_item_plan_settings_first_payout_rule",
        "item_plan_settings",
        type_="check",
    )
    op.drop_index("ix_item_plan_settings_item_id", table_name="item_plan_settings")
    op.drop_table("item_plan_settings")
