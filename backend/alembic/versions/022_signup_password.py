"""self-signup cu username + parola: stocheaza pe access_requests

Userul isi alege username + parola la inregistrare; le pastram pe cerere
(parola hash-uita) si le aplicam la aprobare, ca apoi sa se logheze direct
cu username + parola.

Revision ID: 022
Revises: 021
Create Date: 2026-06-16 11:30:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def _columns(bind, table: str) -> set:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    cols = _columns(bind, "access_requests")
    if "desired_username" not in cols:
        op.add_column("access_requests", sa.Column("desired_username", sa.String(50), nullable=True))
    if "password_hash" not in cols:
        op.add_column("access_requests", sa.Column("password_hash", sa.String(200), nullable=True))
    if "pin_hash" not in cols:
        op.add_column("access_requests", sa.Column("pin_hash", sa.String(200), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    cols = _columns(bind, "access_requests")
    for name in ("pin_hash", "password_hash", "desired_username"):
        if name in cols:
            op.drop_column("access_requests", name)
