from sqlalchemy.orm import Session

from app.models.board_column import BoardColumn
from app.models.sprint import Sprint
from app.models.task import Task
from app.models.user import User
from app.services import membership_service

# Coloanele care inseamna "munca terminata".
DONE_COLUMN_TYPES = {"DONE", "APPROVED"}


def _done_column_ids(db: Session, project_id: str) -> set[str]:
    rows = (
        db.query(BoardColumn.id)
        .filter(
            BoardColumn.project_id == project_id,
            BoardColumn.column_type.in_(DONE_COLUMN_TYPES),
        )
        .all()
    )
    return {r[0] for r in rows}


def project_performance(db: Session, user_id: str, project_id: str) -> dict:
    membership_service.require_membership(db, project_id, user_id, min_role="VIEWER")

    members = membership_service.list_members(db, project_id)
    ids = [m.user_id for m in members]
    rows = db.query(User).filter(User.id.in_(ids)).all() if ids else []
    users = {u.id: u for u in rows}

    done_ids = _done_column_ids(db, project_id)

    # Toate taskurile active de pe board (board_column_id != null).
    tasks = (
        db.query(Task)
        .filter(
            Task.project_id == project_id,
            Task.is_active == True,
            Task.board_column_id.isnot(None),
        )
        .all()
    )

    # ── per membru ──────────────────────────────────────────────────
    per_member = []
    total_completed_points = 0
    for m in members:
        completed_points = 0
        completed_tasks = 0
        assigned_points = 0
        for t in tasks:
            if t.assignee_id != m.user_id:
                continue
            points = t.story_points or 0
            assigned_points += points
            if t.board_column_id in done_ids:
                completed_points += points
                completed_tasks += 1
        total_completed_points += completed_points
        completion_rate = (completed_points / assigned_points) if assigned_points else 0
        u = users.get(m.user_id)
        per_member.append({
            "userId": m.user_id,
            "username": u.username if u else None,
            "completedPoints": completed_points,
            "completedTasks": completed_tasks,
            "assignedPoints": assigned_points,
            "completionRate": round(completion_rate, 4),
        })

    # ── per sprint ──────────────────────────────────────────────────
    sprints = (
        db.query(Sprint)
        .filter(Sprint.project_id == project_id)
        .order_by(Sprint.created_at.asc())
        .all()
    )
    tasks_by_sprint: dict[str, list] = {}
    for t in tasks:
        if t.sprint_id:
            tasks_by_sprint.setdefault(t.sprint_id, []).append(t)

    sprint_stats = []
    total_committed_points = 0
    for s in sprints:
        s_tasks = tasks_by_sprint.get(s.id, [])
        committed = sum(t.story_points or 0 for t in s_tasks)
        completed = sum(
            (t.story_points or 0) for t in s_tasks if t.board_column_id in done_ids
        )
        total_committed_points += committed
        sprint_stats.append({
            "sprintId": s.id,
            "name": s.name,
            "status": s.status,
            "committedPoints": committed,
            "completedPoints": completed,
        })

    return {
        "perMember": per_member,
        "sprints": sprint_stats,
        "totals": {
            "totalCompletedPoints": total_completed_points,
            "totalCommittedPoints": total_committed_points,
        },
    }
