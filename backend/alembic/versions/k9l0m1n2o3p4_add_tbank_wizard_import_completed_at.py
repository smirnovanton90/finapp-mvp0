"""T-Invest: mark wizard import completion (modal flow)

Revision ID: k9l0m1n2o3p4
Revises: i8j9k0l1m2n3
Create Date: 2026-03-25

"""

from alembic import op
import sqlalchemy as sa


revision = "k9l0m1n2o3p4"
down_revision = "i8j9k0l1m2n3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_integrations",
        sa.Column(
            "tbank_wizard_import_completed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    # Существующие интеграции с успешной синхронизацией считаем завершившими мастер
    op.execute(
        sa.text(
            """
            UPDATE user_integrations
            SET tbank_wizard_import_completed_at = last_sync_at
            WHERE provider = 'TBANK_INVEST' AND last_sync_at IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_column("user_integrations", "tbank_wizard_import_completed_at")
