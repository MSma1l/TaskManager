# Arhitectura de ansamblu

Acest document descrie cum se leagă piesele Weekly Task Manager: cele trei suprafețe care lovesc același Postgres, rolul nginx-ului, structura pe straturi a backend-ului, organizarea feature-based a frontend-ului și convențiile non-evidente pe care trebuie să le cunoști înainte să atingi codul.

Pentru detalii pe fiecare zonă, vezi documentele specializate:
[Backend](04-backend.md) · [Frontend](05-frontend.md) · [Baza de date](06-database.md) · [Remindere](09-reminders.md) · [Bot Telegram](08-telegram-bot.md).

---

## Imaginea mare

Aplicația are **trei suprafețe** care expun aceeași logică și aceeași bază de date:

| Suprafață       | Tehnologie                                  | Cine o folosește                                  |
| --------------- | ------------------------------------------- | ------------------------------------------------- |
| **Web App**     | React + TypeScript + Vite, PWA              | utilizatori la `/`, admini la `/admin_task_manager` |
| **REST API**    | FastAPI + SQLAlchemy + Alembic (Python)     | consumat de Web App și de bot                     |
| **Telegram Bot**| python-telegram-bot (polling)               | utilizatori prin chat / comenzi                   |

Sub ele, un singur **Postgres 15** ține tot starea, iar un **nginx** stă în față ca reverse proxy. Totul pornește prin `docker compose` — nu rulezi `uvicorn`/`vite` direct pe host.

Detaliul cheie de arhitectură: **bot-ul Telegram NU este un proces separat**. Rulează în **același proces** cu API-ul FastAPI, pornit din `lifespan`-ul aplicației (vezi `backend/app/main.py`). Aceeași observație și pentru scheduler-ul de remindere. Asta înseamnă că API + bot + scheduler partajează sesiunea SQLAlchemy, configul și ciclul de viață al containerului `backend`.

---

## Diagrama containerelor

```
                         ┌──────────────────────────────────────────┐
                         │             docker compose                │
                         │                                           │
   browser / PWA  ─────► │  ┌─────────┐                              │
   (HTTP/HTTPS)          │  │  nginx  │  reverse proxy               │
                         │  └────┬────┘                              │
                         │       │                                   │
                         │   /api/*│        / (restul)               │
                         │       ▼ │            ▼                     │
                         │  ┌──────────┐   ┌──────────┐              │
   Telegram  ◄───────────┼─►│ backend  │   │ frontend │              │
   (polling)             │  │ :3001    │   │ :3000    │              │
                         │  │ FastAPI  │   │ Vite/PWA │              │
                         │  │ + bot    │   └──────────┘              │
                         │  │ + sched. │                             │
                         │  └────┬─────┘                             │
                         │       │ SQLAlchemy                        │
                         │       ▼                                   │
                         │  ┌──────────┐                             │
                         │  │ postgres │  :5432 (volume persistent)  │
                         │  │   15     │                             │
                         │  └──────────┘                             │
                         └──────────────────────────────────────────┘
```

Note din `docker-compose.yml`:

- `postgres` are healthcheck (`pg_isready`); `backend` așteaptă `service_healthy` înainte să pornească.
- `backend` și `frontend` montează codul ca volume (`./backend:/app`, `./frontend:/app`) → hot reload pe editare.
- `backend` rulează `sh /app/start.sh` (așteaptă Postgres → `alembic upgrade head` → `python seed.py` → `uvicorn --reload`).
- `backend` și `frontend` sunt conectate atât la rețeaua `default`, cât și la o rețea `proxy` **externă** — folosită în deploy pentru un nginx-proxy partajat care rezolvă containerele după nume (`taskmanager-backend-1` / `taskmanager-frontend-1`).

---

## Fluxul unei cereri

Browserul nu vorbește niciodată direct cu backend-ul sau cu Vite — totul trece prin nginx, care decide după prefixul căii.

```
  browser ──► nginx
                │
                ├─ cale începe cu  /api/   ──►  backend:3001   (FastAPI)
                │
                └─ orice altă cale  /       ──►  frontend:3000  (Vite / build static)
```

Bot-ul Telegram ocolește nginx: folosește **polling** (trage update-urile de la Telegram), deci comunică direct cu serverele Telegram din interiorul containerului `backend`.

---

## Rolul nginx

`nginx/nginx.conf` este montat în container. Este un reverse proxy cu rutare după prefix:

| Locație            | Țintă                  | Note                                                              |
| ------------------ | ---------------------- | ----------------------------------------------------------------- |
| `/api/`            | `http://backend:3001`  | tot ce e API; setează `X-Real-IP`, `X-Forwarded-*`, timeout 60s   |
| `= /sw.js`         | `http://frontend:3000` | service worker servit **fresh**, niciodată cache (PWA)            |
| `/` (restul)       | `http://frontend:3000` | aplicația web; suport `Upgrade`/`Connection` pentru HMR/WebSocket |

Config-ul versionat este varianta de **producție** (HTTPS pe 443, certificate Let's Encrypt, redirect 80 → 443, `client_max_body_size 25m` pentru upload-uri de schițe notebook). În dezvoltarea locală, esența rămâne aceeași: `/api/*` → backend, restul → frontend.

> Modificări la nginx → `docker compose restart nginx`.

---

## Backend pe straturi

Backend-ul respectă o arhitectură pe straturi clară (`backend/app/`):

```
backend/app/
├── main.py        # lifespan: scheduler + main bot + admin bot (opțional)
├── core/          # config (.env), database (sesiunea SQLAlchemy), security (JWT)
├── models/        # SQLAlchemy ORM — fără metode de business
├── schemas/       # Pydantic (request / response)
├── services/      # logica de business — SINGURA zonă unde scrii reguli
├── api/           # rute FastAPI — subțiri, deleagă la services
└── telegram/      # bot (commands, free_text, i18n, sesiuni cu stare)
```

**Regula de aur:** rutele din `api/` doar **validează + autentifică + apelează un service**. Logica trăiește în `services/`. Modelele ORM nu conțin business.

```
   request ──► api/<router>.py ──► services/<x>_service.py ──► models/ (ORM) ──► Postgres
               (validare, auth)     (regulile aplicației)        (date)
```

### Agregarea rutelor

`backend/app/api/router.py` adună toate sub-routerele într-un singur `api_router`, inclus apoi în `main.py` cu `app.include_router(api_router)`. Toate endpoint-urile trăiesc sub prefixul **`/api/...`**. Sub-routere existente (selectiv):

```
auth, access_requests, quick_tasks, report_shares, bug_reports, users,
tasks, completions, categories, stats, projects, members, board, office,
assigned, sprints (+ backlog), performance, ai, notifications, notebook,
calendar, comments, activity, watchers, search, friends, push, ical
```

Există și un endpoint de health dedicat `GET /api/health` definit direct în `main.py`.

---

## Frontend feature-based

Frontend-ul (`frontend/src/`) este organizat pe **feature-uri**, fiecare cu aceeași structură internă:

```
frontend/src/
├── app/                 # App.tsx + routes.tsx (ProtectedRoute, AdminRoute)
├── features/
│   ├── auth/  tasks/  calendar/  projects/  notebook/  stats/  profile/
│   ├── admin/  quicktasks/  notifications/  friends/  reports/
│   └── qa/  verify/  viewaccount/
│       ├── api/         # apeluri axios pentru feature
│       ├── components/
│       ├── hooks/       # useX cu state + fetch
│       └── pages/
└── shared/
    ├── api/client.ts    # instanță axios cu interceptor JWT
    ├── components/       # layout + primitive cu adevărat reutilizabile
    ├── hooks/  utils/  i18n/
```

Când adaugi un feature nou, **copiază structura unuia existent** (`features/projects/` e referința). Nu pune componente cross-feature direct în `shared/components/` — doar layout și primitive reutilizabile.

### Interceptorul JWT

`shared/api/client.ts` este o instanță axios cu `baseURL: '/api'` și un interceptor de request care atașează automat `Authorization: Bearer <token>` din `localStorage`. Nu re-implementa asta în feature.

Interceptorul de response tratează și `401`: la expirarea sesiunii curăță token-ul, emite un eveniment `auth:expired` (pe care `useAuth` îl ascultă pentru a afișa un modal) și redirecționează spre `/login` sau `/admin_task_manager` după rol — fără să se autosesizeze pe apelurile de login/verify/refresh.

---

## Lifespan: scheduler + boturi

`main.py` definește un `lifespan` async care orchestrează tot ce trebuie să trăiască alături de API (vezi `backend/app/main.py`):

```
lifespan(app):
  1. assert_secure_config()      # refuză prod cu JWT_SECRET nesigur
  2. start_scheduler()           # APScheduler — remindere la fiecare minut
  3. main bot                    # dacă TELEGRAM_BOT_TOKEN e setat → polling
  4. admin bot (opțional)        # dacă ADMIN_TELEGRAM_BOT_TOKEN e setat → polling
  5. setup_bot_commands()        # meniul de comenzi, dacă există măcar un bot
  ── yield (aplicația rulează) ──
  6. la shutdown: oprește boturile (updater.stop → stop → shutdown)
```

### Scheduler (remindere)

`start_scheduler()` pornește un **APScheduler** care rulează **la fiecare minut**: caută reminderuri de taskuri săptămânale și de evenimente calendar, respectă setările userului (toggle Telegram, "Nu deranja") și folosește tabelele de loguri pentru anti-duplicare. Detalii în [Remindere](09-reminders.md).

### Cele două boturi

| Bot   | Token                       | Obligatoriu | Note                                              |
| ----- | --------------------------- | ----------- | ------------------------------------------------- |
| main  | `TELEGRAM_BOT_TOKEN`        | da          | bot-ul principal pentru toți userii               |
| admin | `ADMIN_TELEGRAM_BOT_TOKEN`  | nu          | opțional; dacă lipsește, adminii cad pe bot-ul main |

Fiecare bot e pornit prin `app.initialize()` → `app.start()` → `updater.start_polling(drop_pending_updates=True)`. Tokenurile placeholder (`your_bot_token_here`) sunt tratate ca neconfigurate. Detalii în [Bot Telegram](08-telegram-bot.md).

---

## Convenții cheie non-evidente

Lucruri care surprind un dev nou — citește-le înainte să modifici date:

- **CUID, nu integer auto-increment** pentru PK-uri (`id = Column(String(25))`). Generează cu utility-ul existent, nu UUID.
- **Soft delete:** nu există `DELETE FROM`; se pune `is_active = False`. Query-urile filtrează implicit `is_active = True`.
- **Recurența evenimentelor de calendar e expandată la query, nu la insert.** DB stochează un singur rând cu `recurrence` + `recurrence_until`; ocurențele se calculează în view/render. Vezi [Baza de date](06-database.md).
- **Tema (light/dark) e salvată dual:** `localStorage` (feedback instant) + `users.theme` (sync între device-uri). Folosește variabile CSS + clase Tailwind semantice (`bg-surface`, `text-fg`, `border-border`) — nu hardcoda `bg-white` / `bg-gray-900`.
- **`TaskCompletion` are `UNIQUE(task_id, week_start)`** — un singur status per task per săptămână (`PENDING / DONE / SKIPPED / NOT_DONE`; `NOT_DONE` cere `skip_reason`).
- **Categoriile** au `color` și `icon` proprii, auto-aplicate pe taskuri/evenimente — ia culoarea din categorie, nu o duplica.
- **Toate textele user-facing în română** (RO default) cu suport RU. Adaugă stringuri în i18n, nu hardcodate.

---

## Pe scurt

- Trei suprafețe (Web, REST API, Telegram Bot) + Postgres + nginx, toate prin `docker compose`.
- nginx rutează `/api/*` → `backend:3001`, restul → `frontend:3000`.
- Bot-ul Telegram și scheduler-ul de remindere rulează **în același proces** cu API-ul, din `lifespan`-ul FastAPI.
- Backend pe straturi: rute subțiri → services (business) → modele ORM. Frontend feature-based cu interceptor JWT centralizat.

Vezi mai departe: [Backend](04-backend.md) · [Frontend](05-frontend.md) · [Baza de date](06-database.md) · [Remindere](09-reminders.md) · [Bot Telegram](08-telegram-bot.md).
