"""clear counterparty_id and related_item_id for TRANSFER transactions

Revision ID: j5k6l7m8n9o0
Revises: c3d4e5f6a7b8
Create Date: 2026-03-11

Для транзакций перевода (direction = 'TRANSFER') контрагент и связанный актив
не используются — очищаем поля в существующих данных.
"""

from alembic import op

revision = "j5k6l7m8n9o0"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE transactions
        SET counterparty_id = NULL, related_item_id = NULL
        WHERE direction = 'TRANSFER'
        AND (counterparty_id IS NOT NULL OR related_item_id IS NOT NULL)
        """
    )


def downgrade() -> None:
    pass
