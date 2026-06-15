from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services import performance_service

router = APIRouter(prefix="/api/projects/{project_id}", tags=["performance"])


@router.get("/performance")
async def project_performance(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return performance_service.project_performance(db, user.id, project_id)
