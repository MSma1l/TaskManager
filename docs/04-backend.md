# Backend (FastAPI)

Backendul TaskManager este un API REST scris în **FastAPI + SQLAlchemy**, organizat
pe straturi clare. În același proces rulează și cele două bot-uri Telegram (pornite
din `lifespan`-ul FastAPI) și scheduler-ul de remindere (APScheduler).

Acest document descrie organizarea pe straturi, ce conține fiecare director, lista
reală a routerelor și serviciilor și cum adaugi un endpoint nou.

Vezi și: [Arhitectura](03-architecture.md) · [Baza de date](06-database.md) · [Auth](07-auth.md)

---

## Structura pe straturi

```
backend/app/
├── main.py             # lifespan: scheduler remindere + bot main + bot admin (opțional)
├── core/               # config (.env), database (sesiune SQLAlchemy), security (JWT + hashing)
│   ├── config.py       # Settings (pydantic-settings) — citește .env
│   ├── database.py     # engine, SessionLocal, Base, get_db()
│   └── security.py     # JWT, get_current_user, require_admin, hash_password/verify_password
├── models/             # SQLAlchemy ORM (un fișier per entitate) — fără logică de business
├── schemas/            # Pydantic request/response — camelCase pe wire
├── services/           # logica de business (SINGURA zonă unde scrii reguli)
├── api/                # rute FastAPI — subțiri: validează + autentifică + deleagă
│   └── router.py       # agregă toate sub-routerele sub /api/...
└── telegram/           # bot-urile (vezi doc dedicat)
```

### Regula de aur

> **Rutele din `api/` validează, autentifică și deleagă la un service. Logica de
> business trăiește în `services/`. Modelele din `models/` NU conțin metode de
> business.**

Concret: o rută face trei lucruri — extrage userul curent (dependency
`get_current_user` / `require_admin`), validează inputul (schema Pydantic) și apelează
funcția de service corespunzătoare. Orice regulă (permisiuni de proiect, tranziții de
status, anti-duplicare etc.) intră în `services/`, nu în rută.

---

## `core/`

### `config.py` — configurarea aplicației

`Settings` extinde `BaseSettings` (pydantic-settings) și citește valorile din `.env`
(`class Config: env_file = ".env"`). O singură instanță globală `settings` e
importată peste tot. Grupuri de variabile:

- **DB / app**: `DATABASE_URL`, `PORT`, `FRONTEND_URL`, `NODE_ENV`.
- **Telegram**: `TELEGRAM_BOT_TOKEN` (main, obligatoriu), `ADMIN_TELEGRAM_BOT_TOKEN`
  (opțional, fallback la main), `TELEGRAM_CHAT_ID`, `TELEGRAM_BOT_USERNAME` (pentru
  deep-links `t.me/...`).
- **Auth / 2FA**: `JWT_SECRET`, `JWT_EXPIRE_HOURS` (default 12), `LOGIN_CODE_TTL_MINUTES`
  (5), `LOGIN_CODE_MAX_ATTEMPTS` (5), `APP_PIN` (legacy, doar pentru seed-ul adminului).
- **Admin seed inițial**: `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_FULL_NAME`,
  `ADMIN_PASSWORD`.
- **Digest zilnic**: `DAILY_DIGEST_HOUR` (UTC, default 8).
- **AI**: `OPENROUTER_API_KEY` + `OPENROUTER_MODEL` + `OPENROUTER_BASE_URL`
  (gateway OpenAI-compatibil; dacă lipsesc, AI-ul cade pe euristici locale),
  `ANTHROPIC_API_KEY` (legacy).
- **Web Push (VAPID)**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
  (opționale; dacă lipsesc, push-ul web e dezactivat gratios).

### `database.py` — sesiunea SQLAlchemy

Minimal și standard:

```python
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

`Base` e clasa de bază pentru toate modelele. `get_db` e dependency-ul FastAPI care
dă o sesiune per-request și o închide la final — îl injectezi cu
`db: Session = Depends(get_db)`.

### `security.py` — JWT, hashing și dependencies de auth

Trei zone:

**Coduri OTP efemere** (login 2FA / link Telegram): `generate_login_code()` (6 cifre),
`hash_secret` / `verify_secret` — SHA256 keyed cu `JWT_SECRET`. Rapid, suficient pentru
coduri scurte cu TTL + lockout. **Nu** se folosește pentru parole.

**Parole / PIN-uri** (secrete de lungă durată): `hash_password` / `verify_password`
folosesc un KDF lent cu salt random per-valoare — **scrypt** (memory-hard) când e
disponibil, altfel **pbkdf2-hmac-sha256** (ambele din stdlib). Hash-ul stocat e
self-describing (`scrypt$N$r$p$salt$dk`). `verify_password` acceptă și formatul legacy
SHA256, iar `password_needs_rehash` semnalează când să faci upgrade la login.

**JWT + dependencies**:
- `issue_token(user, ttl_hours?)` → token HS256 cu claim-urile `sub`, `username`,
  `role`, `tv` (token_version — bump pe user invalidează toate token-urile vechi, ex.
  logout-all) și `exp`/`iat`.
- `decode_token` → ridică `401` pe expirat/invalid.
- `get_current_user` (dependency) → decodează token-ul, încarcă userul activ din DB și
  verifică `token_version`; ridică `401` dacă userul lipsește / e dezactivat / token-ul
  a fost revocat.
- `require_admin` (dependency) → cere `user.role == "ADMIN"`, altfel `403`.
- `assert_secure_config()` → la boot, refuză pornirea în `production` cu un `JWT_SECRET`
  slab (placeholder sau < 32 caractere); în dev doar avertizează.

---

## `api/` — routere

Toate routerele sunt agregate în [`api/router.py`](../backend/app/api/router.py) prin
`api_router.include_router(...)` și montate sub `/api`. Fiecare modul își declară
propriul prefix și `tags` (pentru gruparea în Swagger la `/api/docs`).

| Router (modul)        | Prefix                                          | Ce expune |
|-----------------------|-------------------------------------------------|-----------|
| `auth`                | `/api/auth`                                     | login user/admin, verify cod 2FA, refresh, `me`, PIN |
| `access_requests`     | `/api/access-requests`                          | cereri de cont (signup) + aprobare/respingere admin |
| `quick_tasks`         | `/api/quick-tasks`                              | submit public (fără auth) + inbox admin pentru Quick Tasks |
| `report_shares`       | `/api/report-shares`                            | linkuri publice read-only către rapoarte ("View Account") |
| `bug_reports`         | `/api/projects/{project_id}/bug-reports`        | modulul QA / rapoarte de testare per proiect |
| `users`               | `/api/users`                                    | gestiune utilizatori (admin), profil, setări |
| `tasks`               | `/api/tasks`                                     | CRUD taskuri săptămânale (+ subtaskuri, prioritate, estimări) |
| `completions`         | `/api/completions`                              | status per task per săptămână (DONE/SKIPPED/NOT_DONE) |
| `categories`          | `/api/categories`                              | categorii (culoare + icon) |
| `stats`               | `/api/stats`                                     | statistici personale / agregate |
| `projects`            | `/api/projects`                                 | CRUD proiecte + membership-ul userului curent |
| `members`             | `/api/projects/{project_id}/members`            | membri proiect: invitare, schimbare rol, eliminare |
| `board`               | `/api/projects/{project_id}/board`              | board Kanban (coloane + carduri) per proiect |
| `office`              | `/api/office`                                    | board-ul proiectului de sistem "Birou" |
| `assigned`            | `/api/assigned`                                  | view "Repartizate": taskuri atribuite mie din toate proiectele |
| `sprints`             | `/api/projects/{project_id}/sprints`            | sprinturi per proiect |
| `sprints.backlog_router` | `/api/projects/{project_id}` (`/backlog`, `/reports`) | backlog + rapoarte la nivel de proiect |
| `performance`         | `/api/projects/{project_id}` (`/performance`)   | metrici de performanță per proiect / membru |
| `ai`                  | `/api`                                           | generare/estimare taskuri cu AI (OpenRouter) |
| `notifications`       | `/api/notifications`                            | notificări in-app (listă, marcare citite) |
| `notebook`            | `/api/notebook`                                  | caiet de notițe (topicuri + note) |
| `calendar`            | `/api/calendar`                                  | evenimente calendar + recurențe + remindere |
| `comments`            | `/api/tasks/{task_id}/comments`                 | comentarii pe task (+ @mention) |
| `activity`            | (`/api/tasks/{task_id}/activity`)               | jurnal de activitate per task |
| `watchers`            | `/api/tasks/{task_id}`                          | watchers (urmărire task) |
| `search`              | `/api/search`                                    | căutare globală |
| `friends`             | `/api/friends`                                   | listă de colaboratori (cereri PENDING → ACCEPTED) |
| `push`                | `/api/push`                                      | subscripții Web Push (VAPID) |
| `ical`                | `/api/ical`                                      | feed `.ics` read-only protejat prin token de calendar |

> Notă: `bug_reports`, `performance`, `members`, `board`, `sprints` au prefixe cu
> `{project_id}` în path, pentru că operează în contextul unui proiect și verifică
> permisiunile prin `membership_service`.

---

## `services/` — logica de business

Tot ce e regulă de business stă aici. Rutele doar deleagă. Sesiunea SQLAlchemy
(`db: Session`) e primită ca argument; service-urile nu o creează ele.

| Serviciu                  | Responsabilitate |
|---------------------------|------------------|
| `auth_service`            | login codes (2FA via Telegram), validare, refresh JWT |
| `access_service`          | creare cont (signup) + aprobare admin — sursă unică, refolosită de API și de bot |
| `task_service`            | taskuri săptămânale: CRUD, scoping pe user, calculul săptămânii (luni 00:00) |
| `completion_service`      | status per task per săptămână (`UNIQUE(task_id, week_start)`) |
| `category_service` (în `task`/`stats`) | — (categoriile sunt gestionate prin rutele dedicate) |
| `project_service`         | CRUD proiecte, generarea cheilor, listare cu rol/membri |
| `membership_service`      | permisiuni de proiect (OWNER/ADMIN/MEMBER/VIEWER), invitare/eliminare membri |
| `board_service`           | board Kanban: coloane, mutare carduri, log de activitate |
| `office_service`          | proiectul de sistem "Birou" (`system_key='OFFICE'`) — destinația Quick Task-urilor |
| `assigned_service`        | view "Repartizate": taskuri atribuite mie, grupate pe zone de workflow + arhivă (exclude Biroul) |
| `quick_task_service`      | Quick Tasks: submit public → inbox admin → conversie în Task real, cu notificări |
| `sprint_service`          | sprinturi per proiect |
| `performance_service`     | metrici de performanță (sprint + membri) |
| `stats_service`           | statistici / agregări |
| `calendar_service`        | evenimente calendar, expandarea recurențelor la query |
| `reminder_service`        | APScheduler (rulează la fiecare minut): remindere taskuri + calendar, anti-duplicare, digest zilnic |
| `notebook_service`        | caiet de notițe (topicuri + note) |
| `collaboration_service`   | comentarii, jurnal de activitate, @mention → Telegram, watchers |
| `notification_service`    | notificări in-app; `create_safe` = wrapper non-fatal pentru triggere |
| `friend_service`          | listă de colaboratori (cereri → acceptate), folosită la add-member |
| `bug_report_service`      | modulul QA / Bug Report per proiect (permisiuni via membership) |
| `report_share_service`    | linkuri publice read-only către rapoarte ("View Account") |
| `ai_service`              | generare/estimare taskuri via OpenRouter; fallback pe euristici locale |
| `push_service`            | Web Push (VAPID, pywebpush); degradare gratioasă dacă lipsesc cheile |
| `ical_service`            | export feed `.ics` per user, protejat prin `User.calendar_token` |

Două convenții importante pentru triggere best-effort:

- `notification_service.create_safe` și `board_service._log` **nu aruncă niciodată**
  spre client — o eroare de notificare/log nu trebuie să strice operația principală.
- Notificările Telegram din `collaboration_service` rulează async și respectă
  toggle-ul Telegram + fereastra "Nu deranja" (refolosesc mecanismul din
  `reminder_service`).

---

## `schemas/` — Pydantic (request/response)

Pattern-ul, exemplificat de [`schemas/task.py`](../backend/app/schemas/task.py):
fiecare entitate are de obicei trei modele — `XCreate`, `XUpdate` (toate câmpurile
opționale, pentru PATCH parțial) și `XOut`.

**Pe wire totul e camelCase** (`categoryId`, `dayOfWeek`, `scheduledDate`,
`reminderTime`, `isRecurring`), pentru a se potrivi cu frontend-ul TypeScript — chiar
dacă coloanele din DB sunt snake_case. Modelele `*Out` folosesc
`Config.from_attributes = True` ca să poată fi serializate direct dintr-un obiect ORM.

```python
class TaskCreate(BaseModel):
    title: str
    categoryId: Optional[str] = None
    dayOfWeek: Optional[int] = None
    priority: Optional[str] = "MEDIUM"

class TaskOut(BaseModel):
    id: str
    title: str
    category: Optional[CategoryOut] = None
    isRecurring: bool
    completions: list[CompletionOut] = []

    class Config:
        from_attributes = True
```

Modelele compun alte scheme (`CategoryOut`, `CompletionOut`) pentru a returna obiecte
imbricate gata de afișat.

---

## Cum adaugi un endpoint nou

Respectă fluxul straturilor — de jos în sus:

1. **Schema** (`schemas/<feature>.py`): definește `XCreate` / `XUpdate` / `XOut` în
   camelCase. Refolosește scheme existente pentru câmpurile imbricate.

2. **Service** (`services/<feature>_service.py`): scrie funcția cu logica de business.
   Primește `db: Session` și parametrii deja validați; verifică permisiunile
   (`membership_service` pentru orice e legat de proiect), aplică regulile și
   returnează obiecte ORM sau dict-uri.

   ```python
   def create_widget(db: Session, user: User, data: WidgetCreate) -> Widget:
       # verifică permisiuni, aplică reguli, persistă
       ...
       db.commit()
       return widget
   ```

3. **Ruta** (`api/<feature>.py`): subțire — injectează userul și DB-ul, validează
   inputul cu schema, deleagă la service.

   ```python
   router = APIRouter(prefix="/api/widgets", tags=["widgets"])

   @router.post("", response_model=WidgetOut)
   def create_widget(
       data: WidgetCreate,
       user: User = Depends(get_current_user),
       db: Session = Depends(get_db),
   ):
       return widget_service.create_widget(db, user, data)
   ```

   Pentru rute doar-admin folosește `Depends(require_admin)`.

4. **Înregistrarea** în [`api/router.py`](../backend/app/api/router.py): importă
   modulul și adaugă `api_router.include_router(widgets.router)`.

5. **Migrare DB** dacă ai modificat schema — vezi [Baza de date](06-database.md)
   (întotdeauna prin Alembic, niciodată manual).

Greșeli de evitat: nu pune query-uri / reguli direct în rută; nu adăuga metode de
business pe model; nu hardcoda texte user-facing (folosește i18n RO/RU); respectă
soft-delete-ul (`is_active = False`, nu `DELETE`).
