from pydantic import BaseModel


class CategoryOut(BaseModel):
    id: str
    name: str
    icon: str
    color: str

    class Config:
        from_attributes = True
