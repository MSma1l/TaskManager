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
   - `TELEGRAM_CHAT_ID` - chat ID-ul folosit pentru a seeda admin-ul initial
   - `APP_PIN` - PIN-ul initial al admin-ului (folosit la refresh dupa 12h)
   - `JWT_SECRET` - un string random lung
   - `ADMIN_USERNAME` - username-ul admin-ului seedat (default `admin`)

3. Porneste aplicatia:
```bash
docker compose up --build
```

4. Acceseaza:
   - Web App utilizator: http://localhost
   - **Pagina admin: http://localhost/admin_task_manager** (login separat, rol ADMIN)
   - API: http://localhost:3001
   - Pe iPhone: Safari > Share > "Add to Home Screen"

## Logare

- **Token-ul JWT expira la 12 ore** (configurabil cu `JWT_EXPIRE_HOURS`).
- La logare, userul tasteaza username-ul, primeste un cod de 6 cifre pe **Telegram** (2FA), il introduce si primeste token-ul.
- Cand token-ul expira: alege intre logare cu cod nou pe Telegram **sau** PIN-ul personal (setat din profil sau de admin).

## Useri si admin

- Admin-ul initial e creat la `seed.py` din `ADMIN_USERNAME` + `TELEGRAM_CHAT_ID` + `APP_PIN`.
- Adminii suplimentari, userii noi se creeaza din **/admin_task_manager/users**.
- Pentru a lega un user la un chat de Telegram: admin genereaza un cod /link, userul trimite `/link <cod>` botului.

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
