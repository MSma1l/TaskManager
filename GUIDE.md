# Ghid Complet — Weekly Task Manager

## Cuprins
1. [Ce este acest proiect?](#1-ce-este-acest-proiect)
2. [Arhitectura generală](#2-arhitectura-generală)
3. [Cum pornești proiectul](#3-cum-pornești-proiectul)
4. [Backend — FastAPI + SQLAlchemy](#4-backend--fastapi--sqlalchemy)
5. [Frontend — React + TypeScript + Vite](#5-frontend--react--typescript--vite)
6. [Telegram Bot](#6-telegram-bot)
7. [Baza de date — PostgreSQL + Alembic](#7-baza-de-date--postgresql--alembic)
8. [Docker & Nginx — cum rulează totul](#8-docker--nginx--cum-rulează-totul)
9. [Fluxul datelor în aplicație](#9-fluxul-datelor-în-aplicație)
10. [Concepte importante de învățat](#10-concepte-importante-de-învățat)

---

## 1. Ce este acest proiect?

**Weekly Task Manager** este o aplicație full-stack pentru managementul sarcinilor săptămânale. Are **3 interfețe**:

| Interfață | Tehnologie | Scop |
|-----------|------------|------|
| **Web App** | React + TypeScript | Dashboard vizual cu grid săptămânal |
| **API Backend** | FastAPI (Python) | Logica de business + REST API |
| **Telegram Bot** | python-telegram-bot | Acces rapid din Telegram cu butoane |

Toate cele 3 componente comunică cu **aceeași bază de date PostgreSQL** — adică dacă adaugi un task din Telegram, îl vezi instant în web.

---

## 2. Arhitectura generală

```
┌─────────────────────────────────────────────────────┐
│                    NGINX (:80)                       │
│              (Reverse Proxy)                         │
│                                                     │
│    /api/*  ──────►  Backend FastAPI (:3001)          │
│    /*      ──────►  Frontend React  (:3000)          │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  PostgreSQL (:5432) │
              │    taskmanager DB   │
              └─────────────────────┘
                         ▲
                         │
              ┌─────────────────────┐
              │   Telegram Bot      │
              │ (rulează în backend)│
              └─────────────────────┘
```

### Ce învățăm aici:
- **Reverse Proxy (Nginx)**: Un server care stă în față și direcționează cererile — `/api/*` merge la backend, restul la frontend. Avantajul: un singur port (80) pentru tot.
- **Separarea responsabilităților**: Frontend-ul NU accesează direct baza de date. Totul trece prin API.

---

## 3. Cum pornești proiectul

### Prerequisite
- Docker Desktop instalat
- Un fișier `.env` în rădăcina proiectului

### Comanda magică
```bash
docker-compose up --build
```

### Ce se întâmplă sub capotă:
1. **PostgreSQL** pornește primul și face health check (verifică că e gata)
2. **Backend** așteaptă PostgreSQL, apoi:
   - Rulează **migrările** (Alembic) — creează tabelele
   - Rulează **seed.py** — inserează categorii inițiale
   - Pornește **Uvicorn** (serverul Python)
   - Pornește **Telegram Bot** (polling)
   - Pornește **APScheduler** (remindere)
3. **Frontend** pornește serverul Vite de development
4. **Nginx** pornește și leagă totul la portul 80

### Ce învățăm:
- **Docker Compose** orchestrează mai multe servicii
- `depends_on` + `healthcheck` = pornire în ordine corectă
- `volumes` = datele PostgreSQL persistă între restartări

---

## 4. Backend — FastAPI + SQLAlchemy

### 4.1 Structura dosarelor

```
backend/app/
├── main.py              # Punctul de intrare — creează aplicația FastAPI
├── core/                # Configurare fundamentală
│   ├── config.py        # Variabile de mediu (.env)
│   ├── database.py      # Conexiunea la PostgreSQL
│   └── security.py      # JWT tokens + autentificare
├── models/              # Structura tabelelor (ORM)
├── schemas/             # Validare date intrare/ieșire (Pydantic)
├── services/            # Logica de business
├── api/                 # Rutele HTTP (endpoints)
└── telegram/            # Bot-ul Telegram
```

### 4.2 Conceptul: Layered Architecture (Arhitectură pe straturi)

Datele curg prin 4 straturi, fiecare cu un rol clar:

```
Request HTTP  →  API Route  →  Service  →  Model/DB
                (endpoint)    (logică)    (date)
```

**De ce?** Dacă vrei să schimbi modul în care marchezi un task "done", modifici DOAR `completion_service.py`. Nu atingi ruta API, nu atingi modelul.

### 4.3 Models (SQLAlchemy ORM)

**Fișier**: `backend/app/models/`

ORM = Object-Relational Mapping. În loc să scrii SQL manual, lucrezi cu clase Python:

```python
# Așa arată un model (simplificat)
class Task(Base):
    __tablename__ = "tasks"

    id = Column(String(25), primary_key=True)    # CUID, nu auto-increment
    title = Column(String(200), nullable=False)
    day_of_week = Column(Integer)                 # 1=Luni, 7=Duminică
    is_recurring = Column(Boolean, default=True)  # Se repetă săptămânal?
    is_active = Column(Boolean, default=True)     # Soft delete
    priority = Column(String(10), default="MEDIUM")
    category_id = Column(String(25), ForeignKey("categories.id"))
    project_id = Column(String(25), ForeignKey("projects.id"))

    # Relații — acces direct la obiectele legate
    category = relationship("Category", back_populates="tasks")
    completions = relationship("TaskCompletion", back_populates="task")
```

**Modele principale:**
| Model | Scop |
|-------|------|
| `Task` | Sarcina în sine (titlu, zi, categorie, prioritate) |
| `Category` | Categorii cu icoane și culori (Sport, Lucru, etc.) |
| `TaskCompletion` | Starea per task per săptămână (DONE, SKIPPED, NOT_DONE) |
| `Project` | Proiecte care grupează taskuri |
| `NotebookTopic` | Subiecte/categorii pentru notițe |
| `NotebookNote` | Notițe individuale (steps, tasks, ideas) |
| `ReminderLog` | Evidența reminderelor trimise (evită duplicate) |
| `TelegramSession` | Starea conversației bot (ce pas e userul) |

### Ce învățăm:
- **Soft delete** (`is_active=False`): Nu ștergi niciodată date din DB. Le marchezi inactive. Poți recupera oricând.
- **CUID vs auto-increment**: CUID-urile sunt unice global, nu depind de secvențe DB.
- **Relații (relationships)**: `task.category` returnează direct obiectul Category asociat, fără JOIN manual.

### 4.4 Schemas (Pydantic)

**Fișier**: `backend/app/schemas/`

Pydantic validează datele la intrare și formatează la ieșire:

```python
# Ce primește API-ul (request body)
class TaskCreate(BaseModel):
    title: str                    # Obligatoriu
    category_id: str              # Obligatoriu
    day_of_week: int              # 1-7
    reminder_time: str | None     # Opțional
    priority: str = "MEDIUM"      # Default

# Ce returnează API-ul (response)
class TaskResponse(BaseModel):
    id: str
    title: str
    category: CategoryResponse    # Obiect nested
    completions: list[CompletionResponse]

    class Config:
        from_attributes = True    # Permite conversie din ORM
```

### Ce învățăm:
- **Separare Model vs Schema**: Modelul = structura DB. Schema = ce vede clientul. Nu sunt identice! Poți ascunde câmpuri interne.
- **Validare automată**: Dacă trimiți `day_of_week: "abc"`, FastAPI returnează automat eroare 422.
- **`from_attributes = True`**: Permite Pydantic să citească direct din obiectele SQLAlchemy.

### 4.5 Services (Logica de business)

**Fișier**: `backend/app/services/`

Serviciile conțin logica "inteligentă" a aplicației:

```python
# Exemplu simplificat din completion_service.py
def mark_done(db: Session, task_id: str, week_start: date):
    # 1. Găsește sau creează completion-ul pentru săptămâna asta
    completion = db.query(TaskCompletion).filter(
        TaskCompletion.task_id == task_id,
        TaskCompletion.week_start == week_start
    ).first()

    if not completion:
        completion = TaskCompletion(task_id=task_id, week_start=week_start)
        db.add(completion)

    # 2. Actualizează statusul
    completion.status = "DONE"
    completion.completed_at = datetime.utcnow()
    db.commit()
    return completion
```

**Servicii principale:**
| Serviciu | Ce face |
|----------|---------|
| `task_service` | CRUD taskuri + query pe săptămână/zi |
| `completion_service` | Marchează done/skip/not-done |
| `project_service` | CRUD proiecte + numărare taskuri |
| `notebook_service` | CRUD notițe + tracking istoric |
| `reminder_service` | Verifică și trimite remindere |
| `stats_service` | Calculează statistici săptămânale |

### Ce învățăm:
- **Service layer** izolează logica de business de rute și modele
- **Principiul Single Responsibility**: fiecare serviciu are un singur scop

### 4.6 API Routes (Endpoints)

**Fișier**: `backend/app/api/`

Rutele leagă URL-uri de funcții:

```python
# Exemplu din router.py (simplificat)
@router.get("/tasks/week")
def get_week_tasks(
    week_start: date = Query(...),
    db: Session = Depends(get_db),       # Dependency Injection
    _: dict = Depends(verify_token)      # Auth check
):
    return task_service.get_tasks_for_week(db, week_start)

@router.post("/tasks")
def create_task(
    task_data: TaskCreate,               # Validat automat de Pydantic
    db: Session = Depends(get_db),
    _: dict = Depends(verify_token)
):
    return task_service.create_task(db, task_data)
```

**Endpoints principale:**
```
POST   /api/auth/login           # Login cu PIN → JWT token
GET    /api/tasks/week           # Taskuri pentru o săptămână
POST   /api/tasks                # Creare task
PUT    /api/tasks/{id}           # Editare task
DELETE /api/tasks/{id}           # Ștergere (soft delete)
POST   /api/completions/{id}/done    # Marchează gata
POST   /api/completions/{id}/skip    # Mută pe altă zi
POST   /api/completions/{id}/not-done # Nu s-a făcut + motiv
GET    /api/categories           # Lista categorii
GET    /api/projects             # Lista proiecte
GET    /api/stats/weekly         # Statistici
GET    /api/notebook/topics      # Subiecte notițe
GET    /api/notebook/notes       # Lista notițe
```

### Ce învățăm:
- **Dependency Injection** (`Depends`): FastAPI injectează automat sesiunea DB și verifică tokenul. Nu trebuie să scrii aceeași logică în fiecare rută.
- **RESTful design**: `GET` = citire, `POST` = creare, `PUT` = editare, `DELETE` = ștergere.
- **Path parameters** (`{id}`) vs **Query parameters** (`?week_start=...`).

### 4.7 Autentificare (JWT)

```
Login Flow:
1. Client trimite PIN (ex: 7777) → POST /api/auth/login
2. Backend verifică PIN-ul
3. Dacă e corect → generează JWT token (valabil 30 zile)
4. Client stochează token în localStorage
5. La fiecare request: Authorization: Bearer <token>
6. Backend decodează token-ul și verifică expirarea
```

**JWT (JSON Web Token)** = un șir codat care conține date (ex: user_id, expiration). E semnat cu o cheie secretă, deci nu poate fi falsificat.

---

## 5. Frontend — React + TypeScript + Vite

### 5.1 Structura (Feature-Based Architecture)

```
frontend/src/
├── main.tsx                     # Punctul de intrare React
├── app/
│   ├── App.tsx                  # Root component cu BrowserRouter
│   └── routes.tsx               # Definirea rutelor + ProtectedRoute
├── features/                    # Fiecare feature e izolat
│   ├── auth/                    # Autentificare
│   │   ├── api/auth.ts         # Apeluri API login
│   │   ├── components/PinInput.tsx
│   │   ├── hooks/useAuth.ts    # Custom hook
│   │   └── pages/LoginPage.tsx
│   ├── tasks/                   # Taskuri săptămânale
│   │   ├── api/tasks.ts, categories.ts, completions.ts
│   │   ├── components/WeekGrid.tsx, DayColumn.tsx, AddTaskModal.tsx...
│   │   ├── hooks/useWeek.ts, useTasks.ts
│   │   └── pages/WeekPage.tsx
│   ├── projects/                # Proiecte
│   ├── stats/                   # Statistici cu grafice
│   └── notebook/                # Carnet de notițe
└── shared/                      # Cod partajat
    ├── api/client.ts            # Axios client configurat
    ├── components/layout/       # AppLayout, BottomNav
    ├── hooks/
    └── utils/dates.ts           # Utilități date calendaristice
```

### Ce învățăm:
- **Feature-Based Architecture**: Fiecare funcționalitate (auth, tasks, projects) are propriul folder cu api, componente, hooks și pagini. Mult mai organizat decât a arunca totul într-un folder `components/`.
- **Separation of Concerns**: API calls separate de componente, logică în hooks.

### 5.2 Routing & Protecție

```tsx
// routes.tsx (simplificat)
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" />;
  return children;
};

const routes = [
  { path: "/login", element: <LoginPage /> },
  {
    element: <ProtectedRoute><AppLayout /></ProtectedRoute>,
    children: [
      { path: "/",          element: <WeekPage /> },         // Grid săptămânal
      { path: "/projects",  element: <ProjectsPage /> },
      { path: "/projects/:projectId", element: <ProjectDetailPage /> },
      { path: "/notebook",  element: <NotebookPage /> },
      { path: "/stats",     element: <StatsPage /> },
    ]
  }
];
```

### Ce învățăm:
- **Protected Routes**: Verifici dacă userul e logat. Dacă nu → redirect la login.
- **Nested Routes**: `AppLayout` (cu BottomNav) wrappează toate paginile protejate.
- **Dynamic segments**: `/projects/:projectId` — React Router extrage ID-ul din URL.

### 5.3 API Client (Axios)

```typescript
// shared/api/client.ts (simplificat)
const client = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" }
});

// Interceptor — adaugă token-ul automat la FIECARE request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### Ce învățăm:
- **Axios Interceptors**: În loc să adaugi manual `Authorization` header la fiecare request, îl adaugi o dată în interceptor.
- **baseURL**: Toate requesturile încep cu `/api`, deci scrii doar `/tasks` în loc de `http://localhost/api/tasks`.

### 5.4 Custom Hooks

```typescript
// hooks/useTasks.ts (simplificat)
function useTasks(weekStart: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    setLoading(true);
    const data = await tasksApi.getWeekTasks(weekStart);
    setTasks(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
  }, [weekStart]);

  return { tasks, loading, refetch: fetchTasks };
}
```

### Ce învățăm:
- **Custom Hooks** (`use...`): Extrag logica reutilizabilă din componente. Componenta doar afișează, hook-ul gestionează datele.
- **Separation**: Componenta nu știe de Axios sau API. Ea primește `tasks` și `loading` de la hook.

### 5.5 Componente principale

| Componentă | Ce face |
|-------------|---------|
| `WeekPage` | Pagina principală — afișează gridul săptămânal |
| `WeekGrid` | Grid cu 7 coloane (Luni-Duminică) |
| `DayColumn` | O coloană = o zi cu lista de taskuri |
| `AddTaskModal` | Modal pentru adăugare task |
| `BottomNav` | Navigarea de jos (4 butoane) |
| `PinInput` | Input pentru PIN la login |
| `StatsPage` | Grafice cu Recharts |
| `NotebookPage` | Carnet de notițe |

---

## 6. Telegram Bot

### 6.1 Cum funcționează

Bot-ul rulează **în cadrul backend-ului** (nu e un serviciu separat). La pornirea FastAPI:
1. Se creează instanța bot-ului
2. Se înregistrează handlerii (comenzi, mesaje, callback-uri)
3. Se pornește polling-ul (bot-ul întreabă Telegram la fiecare secundă: "am mesaje noi?")

### 6.2 Handleri — cum procesează mesajele

```python
# Fluxul unui mesaj:
Mesaj primit de la Telegram
    │
    ├── E comandă? (/start, /today, etc.)
    │       → Merge la command handler specific
    │
    ├── E buton din meniu? ("Taskuri azi", "Adauga task")
    │       → Se mapează la funcția corespunzătoare
    │
    ├── E callback (buton inline apăsat)?
    │       │
    │       ├── Prefix "nb_" → Notebook handler
    │       └── Altfel → Task action handler (done, skip, delete)
    │
    ├── E în mijlocul unei conversații?
    │       → Continuă fluxul conversației (ex: adăugare task pas cu pas)
    │
    └── Text liber?
        → Free text handler (ex: "task Fă cumpărături")
```

### 6.3 Conversații cu stare (Stateful Conversations)

Când adaugi un task din Telegram, treci prin pași:

```
1. /add sau "Adauga task"
   Bot: "Scrie titlul taskului"

2. User: "Alergare în parc"
   Bot: "Alege categoria:" [Sport] [Lucru] [Personal]

3. User apasă [Sport]
   Bot: "Pentru ce zi?" [Luni] [Marți] ... [Duminică]

4. User apasă [Miercuri]
   Bot: "La ce oră vrei reminder?" [08:00] [09:00] ...

5. User apasă [07:00]
   Bot: "Prioritate?" [LOW] [MEDIUM] [HIGH]

6. User apasă [MEDIUM]
   Bot: "Se repetă săptămânal?" [Da] [Nu]

7. User apasă [Da]
   Bot: "✅ Task creat: Alergare în parc - Miercuri, Sport"
```

**Starea conversației** e salvată în tabelul `telegram_sessions`. Când userul trimite un mesaj, bot-ul verifică dacă are o conversație activă și știe la ce pas e.

### 6.4 Keyboards (Tastaturi)

Două tipuri de tastaturi în Telegram:

**Reply Keyboard** (meniu persistent jos):
```
┌──────────────┬──────────────┐
│ Taskuri azi  │  Saptamana   │
├──────────────┼──────────────┤
│ Adauga task  │  Statistici  │
├──────────────┼──────────────┤
│Marcheaza facut│   Carnet    │
├──────────────┴──────────────┤
│           Ajutor            │
└─────────────────────────────┘
```

**Inline Keyboard** (butoane sub mesaj):
```
Task: Alergare în parc
[✅ Done] [📅 Move] [❌ Not Done] [🗑 Delete]
```

### Ce învățăm:
- **Polling vs Webhook**: Acest bot folosește polling (simplu de configurat). Webhook e mai eficient dar necesită HTTPS public.
- **State Machine**: Conversația e un automat cu stări. Fiecare pas are o stare, iar inputul utilizatorului determină tranziția.

---

## 7. Baza de date — PostgreSQL + Alembic

### 7.1 Schema bazei de date

```
┌─────────────┐     ┌──────────────────┐     ┌────────────┐
│ categories  │     │     tasks         │     │  projects  │
├─────────────┤     ├──────────────────┤     ├────────────┤
│ id (PK)     │◄────│ category_id (FK) │     │ id (PK)    │
│ name        │     │ id (PK)          │────►│ name       │
│ icon        │     │ title            │     │ description│
│ color       │     │ day_of_week      │     │ github_url │
└─────────────┘     │ is_recurring     │     │ color      │
                    │ reminder_time    │     └────────────┘
                    │ priority         │
                    │ project_id (FK)──┘
                    │ is_active        │
                    └───────┬──────────┘
                            │
                    ┌───────┴──────────┐
                    │ task_completions  │
                    ├──────────────────┤
                    │ id (PK)          │
                    │ task_id (FK)     │
                    │ week_start       │
                    │ status           │  ← PENDING/DONE/SKIPPED/NOT_DONE
                    │ completed_at     │
                    │ skip_reason      │
                    │ UNIQUE(task_id,  │
                    │   week_start)    │  ← Un singur status per task per săptămână
                    └──────────────────┘
```

### 7.2 Alembic — Migrări de bază de date

**Ce sunt migrările?** Scripturi Python care modifică structura bazei de date pas cu pas.

```
alembic/versions/
├── 001_initial.py                    # Tabelele inițiale
├── 002_add_priority_and_duration.py  # Adaugă câmpuri noi
├── 003_add_projects.py               # Tabelul projects
└── 004_add_notebook.py               # Tabelele notebook
```

Fiecare migrare are:
```python
def upgrade():
    # Ce se întâmplă când aplici migrarea
    op.add_column('tasks', sa.Column('priority', sa.String(10)))

def downgrade():
    # Cum revii la starea anterioară
    op.drop_column('tasks', 'priority')
```

**Comenzi importante:**
```bash
alembic upgrade head      # Aplică TOATE migrările noi
alembic downgrade -1      # Revine cu o migrare
alembic revision --autogenerate -m "descriere"  # Generează migrare nouă
```

### Ce învățăm:
- **Migrări** = version control pentru baza de date. La fel cum Git urmărește codul, Alembic urmărește structura DB.
- **Upgrade/Downgrade**: Poți merge înainte sau înapoi. Foarte util în producție.
- **Unique Constraints**: `UNIQUE(task_id, week_start)` previne duplicate — un task nu poate avea 2 statusuri pentru aceeași săptămână.

---

## 8. Docker & Nginx — cum rulează totul

### 8.1 Docker Compose

```yaml
# docker-compose.yml (explicat)
services:
  postgres:           # Baza de date
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data  # Datele persistă!

  backend:            # API + Bot
    build: ./backend
    depends_on:
      postgres:
        condition: service_healthy  # Așteaptă ca DB să fie gata

  frontend:           # React app
    build: ./frontend
    depends_on:
      - backend

  nginx:              # Reverse proxy
    ports:
      - "80:80"       # Singurul port expus public
    depends_on:
      - frontend
      - backend
```

### 8.2 Nginx — Reverse Proxy

```nginx
# Ce face Nginx:
location /api/ {
    proxy_pass http://backend:3001;    # /api/* → Backend
}

location / {
    proxy_pass http://frontend:3000;   # Tot restul → Frontend
}
```

### Ce învățăm:
- **Docker** = fiecare serviciu rulează izolat în propriul container
- **Docker Compose** = orchestrează mai multe containere
- **Volumes** = datele persistă chiar dacă containerul e recreat
- **Reverse Proxy** = un singur punct de intrare pentru tot

---

## 9. Fluxul datelor în aplicație

### Scenariul: User marchează un task ca "Done" din web

```
1. User apasă butonul ✅ pe un task
       │
2. React apelează completionsApi.markDone(taskId)
       │
3. Axios trimite: POST /api/completions/{taskId}/done
   Header: Authorization: Bearer <jwt_token>
       │
4. Nginx primește cererea, vede /api/ → proxy la backend:3001
       │
5. FastAPI primește requestul:
   a. Depends(verify_token) → decodează JWT, verifică expirare
   b. Depends(get_db) → creează sesiune DB
       │
6. Route handler apelează completion_service.mark_done(db, task_id, week_start)
       │
7. Service-ul:
   a. Caută TaskCompletion existent pentru (task_id, week_start)
   b. Dacă nu există → creează unul nou
   c. Setează status = "DONE", completed_at = now()
   d. db.commit() → salvează în PostgreSQL
       │
8. Răspunsul se întoarce: 200 OK + completion object
       │
9. React primește răspunsul → actualizează state → UI se re-renderează
       │
10. Taskul apare ca completat (verde, bifat) în grid
```

### Scenariul: Sistemul de remindere

```
La fiecare minut (APScheduler):
  1. reminder_service.check_reminders() rulează
  2. Verifică ora curentă (ex: 09:00)
  3. Query: taskuri cu reminder_time="09:00" ȘI day_of_week=ziua curentă
  4. Pentru fiecare task găsit:
     a. Verifică ReminderLog — s-a trimis deja azi?
     b. Dacă NU → trimite mesaj Telegram cu detalii task
     c. Salvează în ReminderLog (evită duplicate la următorul check)
```

---

## 10. Concepte importante de învățat

### 10.1 Patterns de design folosite

| Pattern | Unde | De ce |
|---------|------|-------|
| **Repository/Service Layer** | Backend services | Separă logica de business de acces la date |
| **Dependency Injection** | FastAPI `Depends()` | Componente ușor de testat și înlocuit |
| **Feature-Based Architecture** | Frontend folders | Fiecare feature e independent |
| **Soft Delete** | `is_active` flag | Nu pierzi date niciodată |
| **State Machine** | Telegram conversations | Gestionează fluxuri multi-pas |
| **Interceptor** | Axios request interceptor | Logică centralizată de auth |
| **Protected Route** | React Router wrapper | Securizare pagini fără auth |

### 10.2 Concepte de bază de date

- **Foreign Keys (FK)**: `task.category_id` referențiază `categories.id`. Garantează integritate.
- **Unique Constraints**: Previne duplicate la nivel de DB (nu doar la nivel de cod).
- **Indexes**: Optimizează query-urile. Tabelele notebook au indexuri pe `topic_id` și `user_id`.
- **Enums**: `TaskStatus` (PENDING, DONE, SKIPPED, NOT_DONE) — restricționează valorile posibile.
- **Migrations**: Nu modifici DB-ul manual. Scrii migrări versionate.

### 10.3 Concepte de securitate

- **JWT Tokens**: Stateless authentication. Serverul nu ține sesiuni.
- **CORS Middleware**: Controlează ce domenii pot accesa API-ul.
- **Environment Variables**: Secretele (PIN, JWT_SECRET, BOT_TOKEN) nu sunt hardcodate.
- **Bearer Token**: Standard HTTP pentru transmiterea tokenului în header.

### 10.4 Concepte de DevOps

- **Containerizare (Docker)**: Fiecare serviciu rulează izolat, cu propriile dependențe.
- **Orchestrare (Docker Compose)**: Definești toate serviciile într-un singur fișier.
- **Reverse Proxy (Nginx)**: Un singur punct de intrare, routing intern.
- **Health Checks**: Asigură că serviciile sunt gata înainte să le conectezi.
- **Hot Reload**: Uvicorn (backend) și Vite (frontend) reîncarcă automat la schimbări de cod.

### 10.5 Tehnologii — la ce sunt bune

| Tehnologie | Rol | Alternativă populară |
|-----------|-----|---------------------|
| **FastAPI** | Web framework Python, async, rapid | Django, Flask |
| **SQLAlchemy** | ORM Python | Django ORM, Tortoise |
| **Pydantic** | Validare date | marshmallow, cerberus |
| **Alembic** | Migrări DB | Django migrations |
| **React** | UI components | Vue, Svelte, Angular |
| **Vite** | Build tool & dev server | Webpack, CRA |
| **Tailwind CSS** | Utility-first CSS | Bootstrap, Material UI |
| **Axios** | HTTP client | fetch API |
| **Recharts** | Grafice React | Chart.js, D3 |
| **Docker** | Containerizare | Podman |
| **Nginx** | Reverse proxy / web server | Traefik, Caddy |

---

## Sfaturi pentru a continua dezvoltarea

1. **Citește codul în ordinea fluxului**: Model → Schema → Service → Route → Frontend API → Component
2. **Folosește `docker-compose logs -f backend`** pentru a vedea ce se întâmplă în timp real
3. **FastAPI are docs automate**: Accesează `http://localhost/api/docs` pentru Swagger UI
4. **Experimentează cu bot-ul**: Trimite comenzi în Telegram și urmărește logurile
5. **Adaugă features noi urmând pattern-ul existent**: Copiază structura unui feature existent (ex: projects) și adaptează
