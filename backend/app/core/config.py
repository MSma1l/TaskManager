import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://taskuser:taskpass@postgres:5432/taskmanager"
    # Main user-facing bot — used for regular USER notifications and 2FA
    TELEGRAM_BOT_TOKEN: str = "your_bot_token_here"
    TELEGRAM_CHAT_ID: str = "your_chat_id_here"
    # Public bot username (without @) — used to build t.me/<username>?start=...
    # deep links from the frontend. Optional; if blank, the deep-link button is hidden.
    TELEGRAM_BOT_USERNAME: str = ""
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

    # Daily digest ("Agenda ta de azi") — ora la care se trimite rezumatul zilnic
    # pe Telegram. Interpretata in UTC (consecvent cu restul scheduler-ului, care
    # foloseste datetime.utcnow()). Digest-ul pleaca la HH:00 unde HH == aceasta ora.
    DAILY_DIGEST_HOUR: int = 8

    # AI (Claude legacy) — optional; pastrat pentru compatibilitate
    ANTHROPIC_API_KEY: str = ""

    # AI (OpenRouter, OpenAI-compatible gateway) — optional; daca lipseste,
    # AI-ul cade pe euristici locale deterministe
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "openai/gpt-oss-20b:free"
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

    # Web Push (VAPID) — optional. Daca PUBLIC sau PRIVATE lipsesc, push-ul web e
    # dezactivat gratios (push_service.send_to_user devine no-op). Genereaza perechea
    # cu `vapid --gen` (pywebpush) sau orice generator VAPID. SUBJECT trebuie sa fie
    # un mailto: sau un URL.
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_SUBJECT: str = "mailto:admin@example.com"

    # Initial admin (seeded on first run)
    ADMIN_USERNAME: str = "admin"
    ADMIN_EMAIL: str = "maxim.chistol@iis.utm.md"
    ADMIN_FULL_NAME: str = "Administrator"
    ADMIN_PASSWORD: str = "admin1234"  # initial admin password — CHANGE in profile after first login

    class Config:
        env_file = ".env"


settings = Settings()
