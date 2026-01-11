"""add onboarding states

Revision ID: j1a2b3c4d5e6
Revises: i3c4d5e6f7g8
Create Date: 2026-01-11 22:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "j1a2b3c4d5e6"
down_revision = "i3c4d5e6f7g8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "onboarding_states",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("device_type", sa.String(length=10), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default="PENDING",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "device_type in ('WEB','MOBILE')",
            name="ck_onboarding_states_device_type",
        ),
        sa.CheckConstraint(
            "status in ('PENDING','POSTPONED','IN_PROGRESS','COMPLETED','SKIPPED')",
            name="ck_onboarding_states_status",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id", "device_type"),
    )
    op.create_index(
        "ix_onboarding_states_user_id", "onboarding_states", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_onboarding_states_user_id", table_name="onboarding_states")
    op.drop_table("onboarding_states")
