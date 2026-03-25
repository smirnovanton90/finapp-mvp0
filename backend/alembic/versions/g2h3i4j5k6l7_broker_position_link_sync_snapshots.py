"""broker_position_links: sync snapshots per account+figi for item aggregation

Revision ID: g2h3i4j5k6l7
Revises: f1e2d3c4b5a6
Create Date: 2025-03-24

"""
from alembic import op
import sqlalchemy as sa


revision = "g2h3i4j5k6l7"
down_revision = "f1e2d3c4b5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "broker_position_links",
        sa.Column(
            "sync_position_lots",
            sa.BigInteger(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "broker_position_links",
        sa.Column(
            "sync_value_rub_kopecks",
            sa.BigInteger(),
            nullable=False,
            server_default="0",
        ),
    )
    op.alter_column("broker_position_links", "sync_position_lots", server_default=None)
    op.alter_column("broker_position_links", "sync_value_rub_kopecks", server_default=None)


def downgrade() -> None:
    op.drop_column("broker_position_links", "sync_value_rub_kopecks")
    op.drop_column("broker_position_links", "sync_position_lots")
