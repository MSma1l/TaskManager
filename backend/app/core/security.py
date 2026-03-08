from fastapi import Request, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from app.core.config import settings

security = HTTPBearer()


async def verify_token(credentials: HTTPAuthorizationCredentials = None, token: str = None):
    tok = token or (credentials.credentials if credentials else None)
    if not tok:
        raise HTTPException(status_code=401, detail="Token missing")
    try:
        payload = jwt.decode(tok, settings.JWT_SECRET, algorithms=["HS256"])
        if payload.get("pin") != settings.APP_PIN:
            raise HTTPException(status_code=401, detail="Invalid token")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
