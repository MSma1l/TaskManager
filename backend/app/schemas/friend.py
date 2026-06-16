from pydantic import BaseModel
from typing import Optional


class FriendRequestCreate(BaseModel):
    username: str
    relation: Optional[str] = "colleague"  # friend | colleague


class FriendRespond(BaseModel):
    accept: bool
