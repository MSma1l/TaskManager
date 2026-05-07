# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Weekly Task Manager** — multi-user task & calendar app cu trei suprafețe care lovesc același Postgres:
- **Web App** (React + TypeScript + Vite, PWA) — utilizatori normali la `/`, admini la `/admin_task_manager`.
- **REST API** (FastAPI + SQLAlchemy + Alembic, Python).
- **Telegram Bot** (python-telegram-bot, polling) — rulează în același proces cu API-ul, pornit din lifespan-ul FastAPI.

UI-ul, mesajele bot-ului și docstring-urile sunt în **română** (cu suport i18n RO/RU). Păstrează tonul / limba când adaugi text vizibil userului.

## Cum rulezi totul

Toate serviciile pornesc prin `docker compose`. **Nu rula `uvicorn`/`vite` direct pe host** — env-ul, baza de date, nginx-ul și cele două bot-uri sunt înnodate prin compose.

```bash
docker compose up --build              # primul start
docker compose up -d --build           # background
docker compose logs -f backend         # debug backend / bot
docker compose down                    # stop
docker compose down -v                 # stop + șterge DB (RAR — pierzi datele)
docker compose exec postgres psql -U taskuser -d taskmanager   # SQL direct
```

URLs: Web `http://localhost`, Admin `http://localhost/admin_task_manager`, API `http://localhost:3001`, Swagger `http://localhost/api/docs`.

## Comenzi pe servicii

**Backend** (rulate înăuntrul containerului `backend`):
```bash
docker compose exec backend alembic upgrade head                  # aplică migrările
docker compose exec backend alembic revision --autogenerate -m "x"  # generează migrare
docker compose exec backend alembic downgrade -1                  # rollback o migrare
docker compose exec backend python seed.py                        # re-rulează seed (idempotent)
```
La fiecare pornire, [`backend/start.sh`](backend/start.sh) așteaptă Postgres → `alembic upgrade head` → `python seed.py` → `uvicorn --reload`. **Nu trebuie să le rulezi manual** decât dacă schimbi schema în timpul lucrului.

**Frontend** (`frontend/package.json`):
```bash
docker compose exec frontend npm run build      # build production
docker compose exec frontend npx tsc -b         # doar typecheck
```
Vite rulează cu `--reload` montat din volume, deci editările `.tsx`/`.ts` se reflectă instant.

**Tests**: nu există suite de teste momentan — nu inventa comenzi `pytest`/`vitest`. Dacă userul cere teste, întreabă întâi ce framework vrea.

## Arhitectură backend (layered)

```
backend/app/
├── main.py             # lifespan: scheduler + main bot + admin bot (opțional)
├── core/               # config (.env), database (sesiunea SQLAlchemy), security (JWT)
├── models/             # SQLAlchemy ORM
├── schemas/            # Pydantic (request/response)
├── services/           # logica de business (singura zonă unde scrii reguli)
├── api/                # rute FastAPI — subțiri, deleagă la services
└── telegram/           # bot (vezi mai jos)
```

**Regula de aur**: rutele din `api/` validează + autentifică + apelează un service. Logica trăiește în `services/`. Modelele nu conțin metode de business.

[`api/router.py`](backend/app/api/router.py) agregă toate sub-routerele. Endpoint-uri sub `/api/...`.

## Arhitectură frontend (feature-based)

```
frontend/src/
├── app/                       # App.tsx + routes.tsx (ProtectedRoute, AdminRoute)
├── features/{auth,tasks,calendar,projects,notebook,stats,profile,admin}/
│   ├── api/      ── apeluri axios pentru feature
│   ├── components/
│   ├── hooks/    ── useX cu state + fetch
│   └── pages/
└── shared/{api/client.ts, components/layout, hooks, utils}
```

Când adaugi un feature nou, **copiază structura unuia existent** (`features/projects/` e exemplul de referință). Nu pune componente cross-feature direct în `shared/components/` — doar layout și primitive cu adevărat reutilizabile.

`shared/api/client.ts` are interceptor axios care atașează `Authorization: Bearer <token>` din `localStorage`. Nu re-implementa asta în feature.

## Auth flow (citește înainte să atingi auth)

**User normal**: username → cod 6 cifre pe Telegram (de la bot) → JWT 12h. La expirare, userul alege re-cod sau **PIN** personal (`pin_hash` în `users`).

**Admin**: URL separat `/admin_task_manager`, login propriu, doar useri cu `role = ADMIN`. Trece prin același flow 2FA.

**Linking Telegram**: useri noi nu au `telegram_chat_id`. Admin generează un cod (sau userul îl generează din `/profile`), userul trimite `/link <cod>` botului → chat-ul se leagă.

Endpoint-urile relevante: `/api/auth/login`, `/api/auth/admin/login`, `/api/auth/verify`, `/api/auth/refresh`, `/api/auth/me`.

JWT durata e configurabilă cu `JWT_EXPIRE_HOURS` (default 12). Frontend-ul are `ProtectedRoute` și `AdminRoute` în [`app/routes.tsx`](frontend/src/app/routes.tsx).

## Telegram bot

**Două bot-uri**: `TELEGRAM_BOT_TOKEN` (main, obligatoriu) și `ADMIN_TELEGRAM_BOT_TOKEN` (admin, opțional — fallback la cel main). Rulează în același proces cu API-ul, polling pornit în [`main.py:lifespan`](backend/app/main.py).

**Conversații cu stare**: pașii (ex: adăugare task ghidat) sunt persistați în tabelul `telegram_sessions`. Când vine un mesaj, handler-ul citește starea curentă și știe la ce pas e userul.

**Routing mesaje** (vezi `telegram/bot.py` + `commands.py` + `free_text.py`): comandă (`/today`, `/add`, ...) → buton meniu → callback inline (prefix `nb_` = notebook) → continuare conversație → text liber (parser pentru `task ...`).

**i18n**: stringurile bot-ului sunt în [`telegram/i18n.py`](backend/app/telegram/i18n.py) (RO + RU). Limba e per-user (`users.language`).

## Reminders (calendar + tasks)

[`services/reminder_service.py`](backend/app/services/reminder_service.py) pornește un APScheduler la lifespan, care **rulează la fiecare minut**:
1. Pentru taskuri săptămânale: caută taskuri cu `reminder_time` = ora curentă pe ziua curentă.
2. Pentru evenimente calendar: extinde recurențele și caută reminderuri (0/5/10/15/30/60/120/1440 min înainte).
3. Anti-duplicare: tabelele `reminder_logs` și `calendar_reminder_logs` rețin ce s-a trimis.
4. Respectă setările userului: toggle Telegram, fereastră "Nu deranja".

Când modifici reminderuri, **testează cu un task la +1-2 min în viitor** și urmărește `docker compose logs -f backend`.

## Convenții non-evidente ale codebase-ului

- **CUID, nu integer auto-increment** pentru PK-uri (`id = Column(String(25))`). Generează cu utility-ul existent, nu UUID.
- **Soft delete**: nu există `DELETE FROM`; pune `is_active = False`. Toate query-urile filtrează implicit `is_active = True`.
- **`TaskCompletion` are `UNIQUE(task_id, week_start)`** — un singur status per task per săptămână. Status-urile: `PENDING / DONE / SKIPPED / NOT_DONE`. `NOT_DONE` cere `skip_reason` obligatoriu.
- **Recurența evenimentelor calendar** e expandată **la query**, nu la insert — DB stochează un singur rând cu `recurrence` + `recurrence_until`, render-ul calculează ocurențele în view.
- **Tema** (light/dark) e salvată dual: `localStorage` (instant feedback) + `users.theme` (sync între device-uri). Folosește variabile CSS + clase Tailwind semantice (`bg-surface`, `text-fg`, `border-border`) — nu hardcoda `bg-white` / `bg-gray-900`.
- **Categoriile** au `color` și `icon` proprii și se auto-aplică pe taskuri/evenimente. Când afișezi un task, ia culoarea din categorie, nu o duplica pe task.
- **Toate textele user-facing în română** (RO default) cu suport RU. Adaugă strings noi în i18n, nu hardcodate.

## Database

Postgres 15. Schema e versionată prin Alembic în [`backend/alembic/versions/`](backend/alembic/versions/). **Niciodată** modificări manuale la schema — întotdeauna prin migrare.

Modele cheie: `User`, `Task`, `TaskCompletion`, `Category`, `Project`, `CalendarEvent`, `CalendarReminder`, `NotebookTopic`, `NotebookNote`, `LoginCode`, `TelegramSession`, `ReminderLog`, `CalendarReminderLog`, `QrSession`, `AccessRequest`.

Există un dump de referință [`taskmanager_backup.sql`](taskmanager_backup.sql) la rădăcină — util când ai nevoie de date de test, **nu** îl folosi ca sursă de adevăr pentru schemă (Alembic e canonic).

## Nginx

[`nginx/nginx.conf`](nginx/nginx.conf) e mountat în container. Rutează `/api/*` → `backend:3001`, restul → `frontend:3000`. Modificări la nginx → `docker compose restart nginx`.

## .env (variabile critice)

`TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_BOT_TOKEN` (opțional), `TELEGRAM_CHAT_ID` (pentru seed-ul admin inițial), `APP_PIN`, `JWT_SECRET`, `ADMIN_USERNAME` (default `admin`), `JWT_EXPIRE_HOURS` (default 12), `DATABASE_URL`, `FRONTEND_URL`. Nu există `.env.example` versionat — întreabă userul când lipsesc valori.

## Stadiu dezvoltare

Faze 1-3 sunt complete (auth multi-user 2FA, calendar Outlook-like, profil + notificări avansate). Faza 4+ (canvas/stylus, ghid interactiv, polish) e în plan. Vezi [README.md](README.md) pentru detaliul fazelor și [GUIDE.md](GUIDE.md) pentru un walkthrough lung al codebase-ului (orientat educațional, în română).
