from pydantic import BaseModel
from typing import Optional


class MemberInvite(BaseModel):
    username: str
    role: Optional[str] = "MEMBER"


class MemberRoleUpdate(BaseModel):
    role: str
