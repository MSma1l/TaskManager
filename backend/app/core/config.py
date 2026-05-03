import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://taskuser:taskpass@postgres:5432/taskmanager"
    # Main user-facing bot — used for regular USER notifications and 2FA
    TELEGRAM_BOT_TOKEN: str = "your_bot_token_here"
    TELEGRAM_CHAT_ID: str = "your_chat_id_here"
    # Optional separate ADMIN bot — when set, admins receive 2FA codes and reminders via this bot
    ADMIN_TELEGRAM_BOT_TOKEN: str = ""
    ADMIN_TELEGRAM_CHAT_ID: str = ""
    PORT: int = 3001
    FRONTEND_URL: str = "http://localhost:3000"
    NODE_ENV: str = "development"

    # Legacy single-PIN — used only for the seed of the initial admin and as fallback
    APP_PIN: str = "1111"
    JWT_SECRET: str = "change_this_to_a_random_secret_string"

    # Multi-user / 2FA
    JWT_EXPIRE_HOURS: int = 12
    LOGIN_CODE_TTL_MINUTES: int = 5
    LOGIN_CODE_MAX_ATTEMPTS: int = 5

    # Initial admin (seeded on first run)
    ADMIN_USERNAME: str = "admin"
    ADMIN_EMAIL: str = "maxim.chistol@iis.utm.md"
    ADMIN_FULL_NAME: str = "Administrator"
    ADMIN_PASSWORD: str = "admin1234"  # initial admin password — CHANGE in profile after first login

    class Config:
        env_file = ".env"


settings = Settings()
