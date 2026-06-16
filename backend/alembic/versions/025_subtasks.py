"""subtasks (checklist) on board tasks

Faza 4: taskurile de board pot avea o lista de subtaskuri (checklist cu bife).
Stocate ca o coloana JSON `subtasks` pe tabela `tasks`: o lista de
`{"id": cuid, "title": str, "done": bool}`. Expandata la query, fara tabel
separat.

Revision ID: 025
Revises: 024
Create Date: 2026-06-16 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, "tasks", "subtasks"):
        op.add_column("tasks", sa.Column("subtasks", sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind, "tasks", "subtasks"):
        op.drop_column("tasks", "subtasks")
