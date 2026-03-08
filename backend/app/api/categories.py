from fastapi import APIRouter, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_token
from app.models.category import Category

router = APIRouter(prefix="/api/categories", tags=["categories"])
security = HTTPBearer()


@router.get("")
async def get_categories(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    categories = db.query(Category).order_by(Category.name).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "icon": c.icon,
            "color": c.color,
        }
        for c in categories
    ]
