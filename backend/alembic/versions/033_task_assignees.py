"""task_assignees: atribuiri multiple (many-to-many) pentru taskurile de board

Creeaza tabelul task_assignees(task_id, user_id, created_at) cu PK compus + FK.
Apoi backfill: pentru fiecare task cu assignee_id setat, insereaza randul
echivalent in task_assignees (assignee_id ramane "primary" = primul din lista).

Idempotent: create_table protejat de guard pe inspector (has_table).

Revision ID: 033
Revises: 032
Create Date: 2026-06-23 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "033"
down_revision = "032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("task_assignees"):
        op.create_table(
            "task_assignees",
            sa.Column("task_id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("task_id", "user_id"),
        )
        op.create_index("ix_task_assignees_task_id", "task_assignees", ["task_id"])
        op.create_index("ix_task_assignees_user_id", "task_assignees", ["user_id"])

        # Backfill din assignee_id existent (fara duplicate).
        op.execute(
            """
            INSERT INTO task_assignees (task_id, user_id, created_at)
            SELECT t.id, t.assignee_id, NOW()
            FROM tasks t
            WHERE t.assignee_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM task_assignees ta
                  WHERE ta.task_id = t.id AND ta.user_id = t.assignee_id
              )
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if insp.has_table("task_assignees"):
        op.drop_table("task_assignees")
