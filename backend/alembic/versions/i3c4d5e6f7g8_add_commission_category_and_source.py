"""add commission category and transaction source

Revision ID: i3c4d5e6f7g8
Revises: i2b3c4d5e6f7
Create Date: 2026-01-10 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "i3c4d5e6f7g8"
down_revision = "i2b3c4d5e6f7"
branch_labels = None
depends_on = None


def _pg_constraint_exists(name: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return False
    return (
        bind.execute(
            sa.text("select 1 from pg_constraint where conname = :name"),
            {"name": name},
        ).first()
        is not None
    )


def upgrade() -> None:
    bind = op.get_bind()

    if _pg_constraint_exists("ck_transactions_source"):
        op.drop_constraint("ck_transactions_source", "transactions", type_="check")
        op.create_check_constraint(
            "ck_transactions_source",
            "transactions",
            "(source is null) or (source in ('AUTO_ITEM_OPENING','AUTO_ITEM_CLOSING','AUTO_ITEM_COMMISSION','MANUAL'))",
        )

    parent_id = bind.execute(
        sa.text(
            """
            select id
              from categories
             where name = :name
               and owner_user_id is null
               and archived_at is null
             order by id
             limit 1
            """
        ),
        {"name": "Прочие расходы"},
    ).scalar()

    if parent_id is not None:
        exists = bind.execute(
            sa.text(
                """
                select 1
                  from categories
                 where name = :name
                   and parent_id = :parent_id
                   and owner_user_id is null
                   and archived_at is null
                 limit 1
                """
            ),
            {
                "name": "Комиссии от торговли на финансовом рынке",
                "parent_id": parent_id,
            },
        ).first()
        if not exists:
            bind.execute(
                sa.text(
                    """
                    insert into categories (name, parent_id, scope, icon_name, owner_user_id)
                    values (:name, :parent_id, 'EXPENSE', null, null)
                    """
                ),
                {
                    "name": "Комиссии от торговли на финансовом рынке",
                    "parent_id": parent_id,
                },
            )


def downgrade() -> None:
    bind = op.get_bind()

    if _pg_constraint_exists("ck_transactions_source"):
        op.drop_constraint("ck_transactions_source", "transactions", type_="check")
        op.create_check_constraint(
            "ck_transactions_source",
            "transactions",
            "(source is null) or (source in ('AUTO_ITEM_OPENING','AUTO_ITEM_CLOSING','MANUAL'))",
        )

    parent_id = bind.execute(
        sa.text(
            """
            select id
              from categories
             where name = :name
               and owner_user_id is null
               and archived_at is null
             order by id
             limit 1
            """
        ),
        {"name": "Прочие расходы"},
    ).scalar()

    if parent_id is not None:
        bind.execute(
            sa.text(
                """
                delete from categories
                 where name = :name
                   and parent_id = :parent_id
                   and owner_user_id is null
                """
            ),
            {
                "name": "Комиссии от торговли на финансовом рынке",
                "parent_id": parent_id,
            },
        )
