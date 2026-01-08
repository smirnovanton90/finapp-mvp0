"""remove is_bank from counterparties

Revision ID: d1a2b3c4d5e6
Revises: c9d4e5f6a7b8
Create Date: 2026-01-07 19:05:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "d1a2b3c4d5e6"
down_revision = "c9d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_counterparties_bank_legal", "counterparties", type_="check"
    )
    op.drop_column("counterparties", "is_bank")


def downgrade() -> None:
    op.add_column(
        "counterparties",
        sa.Column(
            "is_bank",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.execute(
        """
        UPDATE counterparties
        SET is_bank = TRUE
        WHERE industry_id = (
            SELECT id FROM counterparty_industries WHERE name = 'Банки'
        )
        """
    )
    op.create_check_constraint(
        "ck_counterparties_bank_legal",
        "counterparties",
        "(not is_bank) or entity_type = 'LEGAL'",
    )
