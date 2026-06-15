from pydantic import BaseModel


class CommentInput(BaseModel):
    body: str
