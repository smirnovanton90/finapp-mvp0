"""add yandex_id to users

Revision ID: q2r3s4t5u6v7
Revises: p1q2r3s4t5u6
Create Date: 2026-03-06

"""

from alembic import op
import sqlalchemy as sa

revision = "q2r3s4t5u6v7"
down_revision = "p1q2r3s4t5u6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("yandex_id", sa.String(length=64), nullable=True),
    )
    op.create_unique_constraint(
        "uq_users_yandex_id",
        "users",
        ["yandex_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_users_yandex_id", "users", type_="unique")
    op.drop_column("users", "yandex_id")
