import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://taskuser:taskpass@postgres:5432/taskmanager"
    TELEGRAM_BOT_TOKEN: str = "your_bot_token_here"
    TELEGRAM_CHAT_ID: str = "your_chat_id_here"
    PORT: int = 3001
    FRONTEND_URL: str = "http://localhost:3000"
    NODE_ENV: str = "development"
    APP_PIN: str = "1234"
    JWT_SECRET: str = "change_this_to_a_random_secret_string"

    class Config:
        env_file = ".env"


settings = Settings()
