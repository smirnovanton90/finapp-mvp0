"""add limits

Revision ID: a1b2c3d4e5f7
Revises: f2a3b4c5d6e7
Create Date: 2026-01-06 19:30:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f7"
down_revision = "f2a3b4c5d6e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "limits",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("period", sa.String(length=20), nullable=False),
        sa.Column("custom_start_date", sa.Date(), nullable=True),
        sa.Column("custom_end_date", sa.Date(), nullable=True),
        sa.Column(
            "category_id", sa.BigInteger(), sa.ForeignKey("categories.id"), nullable=False
        ),
        sa.Column("amount_rub", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "period in ('WEEKLY','MONTHLY','YEARLY','CUSTOM')",
            name="ck_limits_period",
        ),
        sa.CheckConstraint("amount_rub >= 0", name="ck_limits_amount_non_negative"),
        sa.CheckConstraint(
            "(period = 'CUSTOM' and custom_start_date is not null and custom_end_date is not null) "
            "or (period <> 'CUSTOM' and custom_start_date is null and custom_end_date is null)",
            name="ck_limits_custom_dates",
        ),
        sa.CheckConstraint(
            "(custom_start_date is null or custom_end_date is null) "
            "or (custom_start_date <= custom_end_date)",
            name="ck_limits_custom_date_order",
        ),
    )
    op.create_index(
        "ix_limits_user_deleted_created_id",
        "limits",
        ["user_id", "deleted_at", "created_at", "id"],
    )
    op.create_index(
        "ix_limits_user_category_id",
        "limits",
        ["user_id", "category_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_limits_user_category_id", table_name="limits")
    op.drop_index("ix_limits_user_deleted_created_id", table_name="limits")
    op.drop_table("limits")
