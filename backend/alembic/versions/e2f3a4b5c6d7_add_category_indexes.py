"""add category indexes

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-01-05 15:30:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "e2f3a4b5c6d7"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_categories_owner_user_id", "categories", ["owner_user_id"])
    op.create_index("ix_categories_parent_id", "categories", ["parent_id"])
    op.create_index("ix_user_category_state_user_id", "user_category_state", ["user_id"])
    op.create_index(
        "ix_categories_active",
        "categories",
        ["archived_at"],
        postgresql_where=sa.text("archived_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_categories_active", table_name="categories")
    op.drop_index("ix_user_category_state_user_id", table_name="user_category_state")
    op.drop_index("ix_categories_parent_id", table_name="categories")
    op.drop_index("ix_categories_owner_user_id", table_name="categories")
