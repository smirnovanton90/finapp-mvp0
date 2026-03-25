"""tbank integration: GetInfo snapshot fields + add Sale category

Revision ID: i8j9k0l1m2n3
Revises: g2h3i4j5k6l7
Create Date: 2026-03-25

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "i8j9k0l1m2n3"
down_revision = "g2h3i4j5k6l7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_integrations",
        sa.Column("tbank_is_premium", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "user_integrations",
        sa.Column("tbank_is_qualified", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "user_integrations",
        sa.Column("tbank_risk_category", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "user_integrations",
        sa.Column("tbank_info_raw", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "user_integrations",
        sa.Column("tbank_info_fetched_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Ensure base category for asset sales exists (global, not per-user)
    op.execute(
        sa.text(
            """
            INSERT INTO categories (name, parent_id, scope, icon_name, owner_user_id, photo_url, photo_mime, photo_data, photo_updated_at, archived_at, synonyms)
            SELECT 'Продажа активов', NULL, 'INCOME', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[]'::jsonb
            WHERE NOT EXISTS (
              SELECT 1 FROM categories WHERE owner_user_id IS NULL AND archived_at IS NULL AND name = 'Продажа активов'
            )
            """
        )
    )


def downgrade() -> None:
    op.drop_column("user_integrations", "tbank_info_fetched_at")
    op.drop_column("user_integrations", "tbank_info_raw")
    op.drop_column("user_integrations", "tbank_risk_category")
    op.drop_column("user_integrations", "tbank_is_qualified")
    op.drop_column("user_integrations", "tbank_is_premium")

    op.execute(
        sa.text(
            """
            DELETE FROM categories
            WHERE owner_user_id IS NULL AND name = 'Продажа активов'
            """
        )
    )
