from datetime import datetime, timedelta
from fastapi import APIRouter
import jwt
from app.core.config import settings
from app.schemas.auth import PinInput, TokenOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
async def login(data: PinInput):
    if data.pin != settings.APP_PIN:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Invalid PIN")

    token = jwt.encode(
        {"pin": settings.APP_PIN, "exp": datetime.utcnow() + timedelta(days=30)},
        settings.JWT_SECRET,
        algorithm="HS256",
    )
    return {"token": token}
