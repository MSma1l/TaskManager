"""user_avatar: avatar de profil per utilizator

Adauga:
  - users.avatar         (Text)    — data URL base64 (data:image/...;base64,...).
                                      Deferred in ORM ca sa NU se incarce in listari.
  - users.avatar_version (Integer) — bumped la fiecare schimbare; 0 = fara avatar.
                                      Folosit pentru cache-busting (?v=) + check ieftin
                                      "are avatar" fara a atinge coloana mare.

Idempotent: add_column protejate de guard pe inspector (stil 039).

Revision ID: 040
Revises: 039
Create Date: 2026-06-30 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "040"
down_revision = "039"
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

    if "users" in tables:
        user_cols = _cols(bind, "users")
        if "avatar" not in user_cols:
            op.add_column("users", sa.Column("avatar", sa.Text(), nullable=True))
        if "avatar_version" not in user_cols:
            op.add_column(
                "users",
                sa.Column(
                    "avatar_version",
                    sa.Integer(),
                    nullable=False,
                    server_default="0",
                ),
            )


def downgrade() -> None:
    bind = op.get_bind()

    user_cols = _cols(bind, "users")
    if "avatar_version" in user_cols:
        op.drop_column("users", "avatar_version")
    if "avatar" in user_cols:
        op.drop_column("users", "avatar")
