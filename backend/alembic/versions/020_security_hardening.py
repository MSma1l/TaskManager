"""security hardening: brute-force lockout + token revocation + must-change-password

Adds four columns on `users`:
  - `failed_login_attempts` — contor pentru lockout la brute-force pe parolă/PIN.
  - `locked_until` — momentul până la care contul e blocat după prea multe eșecuri.
  - `token_version` — bump-ul invalidează toate JWT-urile vechi (revocare).
  - `must_change_password` — forțează schimbarea parolei (ex. parolă admin default).

Coloanele sunt adăugate idempotent (guard pe inspecția coloanelor existente) cu
default-uri server-side ca rândurile existente să fie populate la upgrade.

Revision ID: 020
Revises: 019
Create Date: 2026-06-16 09:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def _columns(bind, table: str) -> set:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    cols = _columns(bind, "users")

    if "failed_login_attempts" not in cols:
        op.add_column(
            "users",
            sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default="0"),
        )
    if "locked_until" not in cols:
        op.add_column("users", sa.Column("locked_until", sa.DateTime(), nullable=True))
    if "token_version" not in cols:
        op.add_column(
            "users",
            sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
        )
    if "must_change_password" not in cols:
        op.add_column(
            "users",
            sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    bind = op.get_bind()
    cols = _columns(bind, "users")
    for name in ("must_change_password", "token_version", "locked_until", "failed_login_attempts"):
        if name in cols:
            op.drop_column("users", name)
