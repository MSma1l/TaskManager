"""tg-login: extinde qr_sessions + access_requests pentru login Telegram cu aprobare admin

Adaugă pe `qr_sessions`:
  - `flow` — 'qr' (scan-to-login clasic) sau 'tglogin' (login din Telegram).
  - `access_request_id` — cererea de acces legată (user nou ce așteaptă aprobare).
Adaugă pe `access_requests`:
  - `qr_session_id` — sesiunea web ce așteaptă aprobarea ca să primească JWT.
  - `source` — 'web' | 'telegram' (de unde a venit cererea).

Idempotent (guard pe coloanele existente) cu server_default ca rândurile vechi
să fie populate la upgrade.

Revision ID: 021
Revises: 020
Create Date: 2026-06-16 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def _columns(bind, table: str) -> set:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()

    qr = _columns(bind, "qr_sessions")
    if qr:
        if "flow" not in qr:
            op.add_column(
                "qr_sessions",
                sa.Column("flow", sa.String(20), nullable=False, server_default="qr"),
            )
        if "access_request_id" not in qr:
            op.add_column("qr_sessions", sa.Column("access_request_id", sa.String(), nullable=True))

    ar = _columns(bind, "access_requests")
    if ar:
        if "qr_session_id" not in ar:
            op.add_column("access_requests", sa.Column("qr_session_id", sa.String(), nullable=True))
        if "source" not in ar:
            op.add_column(
                "access_requests",
                sa.Column("source", sa.String(20), nullable=False, server_default="web"),
            )


def downgrade() -> None:
    bind = op.get_bind()
    ar = _columns(bind, "access_requests")
    for name in ("source", "qr_session_id"):
        if name in ar:
            op.drop_column("access_requests", name)
    qr = _columns(bind, "qr_sessions")
    for name in ("access_request_id", "flow"):
        if name in qr:
            op.drop_column("qr_sessions", name)
