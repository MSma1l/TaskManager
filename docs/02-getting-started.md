# 02 — Getting Started (rulare locală)

Cum pornești toate cele trei suprafețe (Web, API, Bot) pe mașina ta. Totul rulează prin **Docker Compose** — env-ul, baza de date, nginx-ul și bot-urile sunt înnodate prin compose, așa că **nu rula `uvicorn` sau `vite` direct pe host**.

Pentru ce *este* fiecare suprafață vezi [01 — Concept](01-concept.md); pentru deployment pe server vezi [11 — Deployment](11-deployment.md).

---

## Cerințe

- **Docker** și **Docker Compose** (v2, comanda `docker compose`).
- Un bot de Telegram (token de la `@BotFather`) — necesar pentru login 2FA și notificări.

Atât. Python, Node, Postgres etc. rulează toate în containere.

---

## Pasul 1 — `.env`

Există un template versionat. Copiază-l și completează valorile marcate OBLIGATORIU.

```bash
cp .env.example .env
```

### Variabile critice

| Variabilă | Obligatoriu | Ce reprezintă |
|-----------|:-----------:|---------------|
| `DATABASE_URL` | da | Conexiunea Postgres. Host-ul **trebuie** să fie `postgres` (numele serviciului din compose); user/parola/db trebuie să coincidă cu `POSTGRES_*`. |
| `TELEGRAM_BOT_TOKEN` | da | Token-ul botului principal (de la `@BotFather`). Fără el, codurile 2FA și notificările nu se trimit. |
| `TELEGRAM_CHAT_ID` | da | Chat ID-ul tău Telegram — folosit la seed-ul admin-ului inițial. |
| `APP_PIN` | da | PIN-ul inițial al adminului (fallback la refresh după expirarea tokenului). |
| `JWT_SECRET` | da | Secret pentru semnarea JWT. Generează cu `openssl rand -hex 32`. |
| `ADMIN_USERNAME` | da (default `admin`) | Username-ul adminului seedat la primul start. |
| `JWT_EXPIRE_HOURS` | nu (default `12`) | Durata sesiunii (ore) înainte de re-login. |
| `FRONTEND_URL` | da | URL-ul public al frontend-ului (linkuri/CORS). Local: `http://localhost:3000`. |
| `ADMIN_TELEGRAM_BOT_TOKEN` | nu | Bot **separat** pentru admini. Dacă e gol, adminii folosesc botul principal. |

> Variabile suplimentare (toate citite efectiv de `backend/app/core/config.py`): `POSTGRES_USER/PASSWORD/DB`, `TELEGRAM_BOT_USERNAME` (deep-link `t.me/...`), `LOGIN_CODE_TTL_MINUTES`, `LOGIN_CODE_MAX_ATTEMPTS`, `ADMIN_EMAIL/FULL_NAME/PASSWORD`, AI opțional (`OPENROUTER_*`, `ANTHROPIC_API_KEY`) și Web Push (`VAPID_*`). Vezi comentariile din `.env.example`.

---

## Pasul 2 — Pornire

```bash
docker compose up --build        # primul start (build + foreground)
docker compose up -d --build     # în background
docker compose logs -f backend   # urmărește backend-ul + botul
docker compose down              # stop
docker compose down -v           # stop + ȘTERGE DB (RAR — pierzi datele)
```

### Ce face `backend/start.sh` la pornire

La fiecare start, containerul `backend` rulează automat, **în ordine**:

1. Așteaptă ca **Postgres** să fie gata (retry la 2s).
2. `alembic upgrade head` — aplică toate migrările.
3. `python seed.py` — rulează seed-ul (idempotent: creează adminul inițial, proiectul-sistem «Birou» etc.).
4. `uvicorn app.main:app --reload` — pornește API-ul și, din lifespan, scheduler-ul de remindere și bot-urile Telegram.

Nu trebuie să rulezi acești pași manual decât dacă schimbi schema în timpul lucrului.

---

## Pasul 3 — Accesează

| Suprafață | URL |
|-----------|-----|
| Web App (utilizator) | `http://localhost` |
| Pagina admin | `http://localhost/admin_task_manager` |
| REST API (direct) | `http://localhost:3001` |
| Swagger (docs API) | `http://localhost/api/docs` |

Pe iPhone/iPad poți instala PWA-ul: Safari → Share → „Add to Home Screen".

---

## Comenzi utile pe servicii

**Backend** (rulate în containerul `backend`):

```bash
docker compose exec backend alembic upgrade head                     # aplică migrările
docker compose exec backend alembic revision --autogenerate -m "x"   # generează migrare nouă
docker compose exec backend alembic downgrade -1                     # rollback o migrare
docker compose exec backend python seed.py                           # re-rulează seed (idempotent)
```

**Frontend** (`frontend/package.json`):

```bash
docker compose exec frontend npm run build      # build production
docker compose exec frontend npx tsc -b         # doar typecheck
```

Vite rulează cu volume montate, deci editările `.tsx`/`.ts` se reflectă instant.

**Acces direct la DB:**

```bash
docker compose exec postgres psql -U taskuser -d taskmanager
```

> Reminder: **nu** rula `uvicorn` sau `vite` direct pe host — contextul, baza de date, nginx-ul și bot-urile sunt legate prin compose.

---

Mai departe: [03 — Arhitectura](03-architecture.md) pentru cum se leagă serviciile, sau [11 — Deployment](11-deployment.md) pentru server.
