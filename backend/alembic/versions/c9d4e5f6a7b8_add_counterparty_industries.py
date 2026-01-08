"""add counterparty industries

Revision ID: c9d4e5f6a7b8
Revises: b7c8d9e0f1a2
Create Date: 2026-01-07 18:20:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c9d4e5f6a7b8"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "counterparty_industries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=200), nullable=False, unique=True),
    )
    op.add_column(
        "counterparties", sa.Column("industry_id", sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        "fk_counterparties_industry_id",
        "counterparties",
        "counterparty_industries",
        ["industry_id"],
        ["id"],
    )

    industries = sa.table(
        "counterparty_industries",
        sa.column("id", sa.Integer),
        sa.column("name", sa.String),
    )
    op.bulk_insert(
        industries,
        [
            {"id": 1, "name": "Энергетика и коммунальные услуги"},
            {"id": 2, "name": "Транспорт и логистика"},
            {"id": 3, "name": "Торговля"},
            {"id": 4, "name": "Финансы и страхование"},
            {"id": 5, "name": "Банки"},
            {"id": 6, "name": "Информационные технологии и связь"},
            {"id": 7, "name": "Государственный сектор"},
            {"id": 8, "name": "Образование и наука"},
            {"id": 9, "name": "Здравоохранение и фармацевтика"},
            {"id": 10, "name": "Услуги"},
            {"id": 11, "name": "Культура, спорт и развлечения"},
            {"id": 12, "name": "Недвижимость и управление имуществом"},
        ],
    )

    op.execute("UPDATE counterparties SET industry_id = 5 WHERE is_bank = TRUE")


def downgrade() -> None:
    op.drop_constraint(
        "fk_counterparties_industry_id", "counterparties", type_="foreignkey"
    )
    op.drop_column("counterparties", "industry_id")
    op.drop_table("counterparty_industries")
