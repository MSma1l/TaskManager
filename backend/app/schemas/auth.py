from pydantic import BaseModel


class PinInput(BaseModel):
    pin: str


class TokenOut(BaseModel):
    token: str
