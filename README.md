# Weekly Task Manager

Aplicatie personala de management taskuri saptamanale cu Web App (PWA) + Telegram Bot.

## Stack

- **Backend:** Python + FastAPI + SQLAlchemy + Alembic
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Database:** PostgreSQL
- **Bot:** python-telegram-bot
- **Containerizare:** Docker + docker-compose + Nginx

## Pornire rapida

1. Copiaza fisierul de configurare:
```bash
cp .env.example .env
```

2. Completeaza `.env`:
   - `TELEGRAM_BOT_TOKEN` - de la @BotFather pe Telegram
   - `TELEGRAM_CHAT_ID` - ID-ul tau de chat Telegram
   - `APP_PIN` - PIN-ul de acces la aplicatie (ex: 1234)
   - `JWT_SECRET` - un string random lung

3. Porneste aplicatia:
```bash
docker compose up --build
```

4. Acceseaza:
   - Web App: http://localhost (prin Nginx) sau http://localhost:3000 (direct Vite)
   - API: http://localhost:3001
   - Pe iPhone: Safari > Share > "Add to Home Screen"

## Cum obtii Telegram Token si Chat ID

### Token:
1. Deschide Telegram, cauta @BotFather
2. Trimite `/newbot`, urmeaza pasii
3. Copiaza TOKEN-ul primit in `.env` -> `TELEGRAM_BOT_TOKEN`

### Chat ID:
1. Scrie `/start` botului tau nou creat
2. Acceseaza in browser: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Gaseste in raspuns: `"chat":{"id": XXXXXXXXX}`
4. Copiaza acel numar in `.env` -> `TELEGRAM_CHAT_ID`

## Comenzi Telegram

| Comanda | Descriere |
|---------|-----------|
| `/today` | Taskurile de azi |
| `/week` | Taskurile saptamanii |
| `/tasks` | Alege ziua si vezi taskurile |
| `/add` | Adauga task nou (ghidat) |
| `/done` | Marcheaza task ca facut |
| `/skip` | Muta task pe alta zi |
| `/notdone` | Marcheaza ca nefacut (motiv obligatoriu) |
| `/stats` | Statistici saptamana curenta |
| `/help` | Lista tuturor comenzilor |

### Adaugare rapida din chat:
Scrie direct in chat: `task numele taskului`
Exemplu: `task verifica backup servere`
Botul te va ghida sa alegi data si categoria.

## Comenzi Docker utile

```bash
# Pornire
docker compose up --build

# Pornire in background
docker compose up -d --build

# Oprire
docker compose down

# Reset complet (sterge si datele din DB)
docker compose down -v

# Vezi log-uri backend
docker compose logs -f backend

# Acceseaza DB direct
docker compose exec postgres psql -U taskuser -d taskmanager
```
