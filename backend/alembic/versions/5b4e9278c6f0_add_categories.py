"""add categories table

Revision ID: 5b4e9278c6f0
Revises: cee01bb4abb2
Create Date: 2024-07-18 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "5b4e9278c6f0"
down_revision = "cee01bb4abb2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("level", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("parent_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint([
            "parent_id",
        ], ["categories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"],),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("level in (1,2,3)", name="ck_categories_level"),
    )
    op.create_index(
        "ix_categories_user_level_parent_name",
        "categories",
        ["user_id", "level", "parent_id", "name"],
    )


def downgrade() -> None:
    op.drop_index("ix_categories_user_level_parent_name", table_name="categories")
    op.drop_table("categories")
