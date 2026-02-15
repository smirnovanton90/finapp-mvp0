"""add telegram fields and link codes table

Revision ID: t1u2v3w4x5y6
Revises: s1t2u3v4w5x6
Create Date: 2026-02-15

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "t1u2v3w4x5y6"
down_revision: Union[str, Sequence[str], None] = "s1t2u3v4w5x6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("telegram_chat_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("telegram_notify_hour", sa.Integer(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("telegram_notify_minute", sa.Integer(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("telegram_notify_enabled", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.create_check_constraint(
        "ck_users_telegram_notify_hour",
        "users",
        "(telegram_notify_hour is null) or (telegram_notify_hour >= 0 and telegram_notify_hour <= 23)",
    )
    op.create_check_constraint(
        "ck_users_telegram_notify_minute",
        "users",
        "(telegram_notify_minute is null) or (telegram_notify_minute >= 0 and telegram_notify_minute <= 59)",
    )

    op.create_table(
        "telegram_link_codes",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(10), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_telegram_link_codes_code", "telegram_link_codes", ["code"], unique=True)
    op.create_index("ix_telegram_link_codes_user_id", "telegram_link_codes", ["user_id"])


def downgrade() -> None:
    op.drop_table("telegram_link_codes")
    op.drop_constraint("ck_users_telegram_notify_minute", "users", type_="check")
    op.drop_constraint("ck_users_telegram_notify_hour", "users", type_="check")
    op.drop_column("users", "telegram_notify_enabled")
    op.drop_column("users", "telegram_notify_minute")
    op.drop_column("users", "telegram_notify_hour")
    op.drop_column("users", "telegram_chat_id")
