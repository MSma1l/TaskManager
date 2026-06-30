"""notification_priority: prioritate pe notificarile in-app

Adauga:
  - notifications.priority (String(20), NOT NULL, default "STANDARD")
                                      STANDARD = doar in-app.
                                      URGENT   = in-app (evidentiat in frontend) +
                                                 mesaj Telegram pentru destinatarii legati.

Idempotent: add_column protejat de guard pe inspector (stil 040).

Revision ID: 041
Revises: 040
Create Date: 2026-06-30 15:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "041"
down_revision = "040"
branch_labels = None
depends_on = None


def _cols(bind, table: str) -> set[str]:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())

    if "notifications" in tables:
        cols = _cols(bind, "notifications")
        if "priority" not in cols:
            op.add_column(
                "notifications",
                sa.Column(
                    "priority",
                    sa.String(length=20),
                    nullable=False,
                    server_default="STANDARD",
                ),
            )


def downgrade() -> None:
    bind = op.get_bind()

    cols = _cols(bind, "notifications")
    if "priority" in cols:
        op.drop_column("notifications", "priority")
