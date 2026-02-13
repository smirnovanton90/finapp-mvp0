"""ensure counterparty synonyms column exists

Revision ID: r0s1t2u3v4w5
Revises: q9r0s1t2u3v4
Create Date: 2026-02-13

"""
from typing import Sequence, Union

from alembic import op

revision: str = "r0s1t2u3v4w5"
down_revision: Union[str, Sequence[str], None] = "q9r0s1t2u3v4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Добавить колонку, если её нет (на случай, когда ревизия была отмечена без применения)
    op.execute(
        """
        ALTER TABLE counterparties
        ADD COLUMN IF NOT EXISTS synonyms JSONB NOT NULL DEFAULT '[]'::jsonb
        """
    )


def downgrade() -> None:
    op.drop_column("counterparties", "synonyms")
