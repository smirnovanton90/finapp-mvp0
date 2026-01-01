"""
Add category direction

Revision ID: 3a1f3d0a4c9f
Revises: 5b4e9278c6f0
Create Date: 2024-07-30 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "3a1f3d0a4c9f"
down_revision = "5b4e9278c6f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column(
            "direction", sa.String(length=20), server_default="BOTH", nullable=False
        ),
    )
    op.create_check_constraint(
        "ck_categories_direction",
        "categories",
        "direction in ('INCOME','EXPENSE','BOTH')",
    )

    bind = op.get_bind()
    categories = sa.table(
        "categories",
        sa.column("id", sa.BigInteger()),
        sa.column("level", sa.BigInteger()),
        sa.column("name", sa.String()),
        sa.column("parent_id", sa.BigInteger()),
        sa.column("direction", sa.String()),
    )

    income_roots = [
        "Доход от основного места работы",
        "Пассивный доход",
        "Бонусы и Cash-back",
        "Прочие доходы",
    ]

    conn = bind.connect()

    # Проставляем направления для корней
    conn.execute(
        categories.update()
        .where(categories.c.level == 1, categories.c.name.in_(income_roots))
        .values(direction="INCOME")
    )
    conn.execute(
        categories.update()
        .where(categories.c.level == 1, ~categories.c.name.in_(income_roots))
        .values(direction="EXPENSE")
    )

    # Наследуем направление родителя, если явно не задано
    conn.execute(
        sa.text(
            """
            UPDATE categories c
            SET direction = p.direction
            FROM categories p
            WHERE c.parent_id = p.id AND c.direction = 'BOTH'
            """
        )
    )

    op.alter_column("categories", "direction", server_default=None)


def downgrade() -> None:
    op.drop_constraint("ck_categories_direction", "categories")
    op.drop_column("categories", "direction")
