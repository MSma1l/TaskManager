# Modulul Jira (Proiecte colaborative + Board + Sprinturi)

Documentație practică pentru modulul de colaborare tip Jira adăugat peste Task Manager.
Audiență: owner-ul aplicației și viitorii contribuitori.

> TL;DR: pe lângă taskurile săptămânale personale (neschimbate), ai acum **proiecte cu echipă**,
> **board Kanban cu workflow**, **backlog + sprinturi**, **story points cu estimare AI**,
> **dashboard de performanță** și **colaborare** (comentarii, @mention pe Telegram, watchers, activity log).

---

## 1. Prezentare generală

Aplicația avea deja `Project` + `Task`, dar totul era izolat pe `user_id` (un user vedea doar datele lui).
Modulul Jira adaugă **colaborare în echipă** peste aceeași bază de date, fără să atingă modulul personal.

Decizia de arhitectură cheie: **nu am creat un tabel separat de „board task"**. Un task de board e
același `Task`, doar cu `board_column_id` setat:

- **Task săptămânal (personal)** = `Task` cu `day_of_week` setat și `board_column_id` NULL → apare în view-ul `/`.
- **Task de board** = `Task` cu `board_column_id` setat → apare pe board, în backlog/sprint, etc.

Consecințe: `tasks.day_of_week` și `tasks.category_id` sunt **nullable**, iar funcțiile săptămânale din
`task_service` filtrează implicit `Task.board_column_id IS NULL` ca să rămână identice. Mutațiile de board
**NU** trec prin `/api/tasks` (acela e scoped pe `user_id` → ar da 404 altor membri), ci prin endpointurile
de board cu verificare de membership.

Sincronizarea „aproape real-time" se face prin **polling ~5s** în frontend (`useBoard`), nu prin WebSocket.

Cod relevant:
- Backend: `backend/app/api/{board,members,sprints,performance,ai,comments,activity,watchers}.py`,
  `backend/app/services/{board_service,membership_service,sprint_service,performance_service,ai_service,collaboration_service,project_service}.py`
- Frontend: `frontend/src/features/projects/` (pages `BoardPage`, `ProjectDetailPage`; hooks `useBoard`, `useSprints`, `usePerformance`, `useComments`, `useMembers`, ...)

---

## 2. Roluri & acces

Accesul la un proiect e dat de tabelul **`ProjectMember`** (`UNIQUE(project_id, user_id)`), cu rolul
`OWNER / ADMIN / MEMBER / VIEWER` (enum `ProjectRole` în `models/base.py`, stocat ca String).

Ierarhia (`ROLE_RANK` în `membership_service.py`):

| Rol | Rank | Poate |
|-----|------|-------|
| `VIEWER` | 0 | citește board / membri / sprinturi / performanță |
| `MEMBER` | 1 | creează/editează taskuri de board, mută (drag&drop), comentează, își planifică taskurile alocate, folosește AI |
| `ADMIN` | 2 | tot ce poate MEMBER + invită/elimină membri, CRUD coloane, CRUD sprinturi, aprobă taskuri (team lead) |
| `OWNER` | 3 | tot + schimbă rolurile membrilor + șterge proiectul |

**Team lead** = OWNER **sau** ADMIN. El repartizează taskurile membrilor și e singurul care poate face
acțiunea **Approve**.

**Creatorul proiectului** devine automat `OWNER` (vezi `project_service.create_project` + backfill-ul din
migrarea 015 pentru proiectele vechi).

**Invitarea** se face **după username** (`POST /api/projects/{id}/members` cu `{ "username": "...", "role": "..." }`),
permisă de ADMIN+. Roluri atribuibile la invitare: `ADMIN / MEMBER / VIEWER` (OWNER nu se acordă manual).
Există protecție „ultimul OWNER": nu poți retrograda sau elimina singurul OWNER.

Endpointuri membri (`backend/app/api/members.py`):

```
GET    /api/projects/{id}/members            # VIEWER+
POST   /api/projects/{id}/members            # ADMIN+  body: {username, role?}
PUT    /api/projects/{id}/members/{userId}   # role -> doar OWNER; capacityPoints -> ADMIN+ sau el însuși
DELETE /api/projects/{id}/members/{userId}   # ADMIN+  (protecție ultimul OWNER)
```

---

## 3. Project Key

Fiecare proiect are un **Key** scurt (ex. `IA`), editabil de admin, derivat implicit din nume la creare
(`projects.key`). Proiectul ține și un `task_counter`.

Când se creează un task de board, se incrementează contorul și taskul primește un `task_number`. Pe UI
taskul apare ca **`KEY-N`** (ex. `IA-7`). În payload-ul de board câmpul e `taskKey` (compus din
`project_key` + `taskNumber`).

---

## 4. Board Kanban & workflow

Board-ul e o listă de **coloane** (`BoardColumn`), fiecare cu un **tip** (`column_type`):

`BACKLOG | PLANNED | IN_PROGRESS | DONE | APPROVED | CUSTOM`

Coloanele implicite seedate la crearea proiectului (RO, vezi `DEFAULT_COLUMNS` în `board_service.py`):

| Nume | Tip | `is_done_column` |
|------|-----|------------------|
| Backlog | `BACKLOG` | nu |
| Planificate | `PLANNED` | nu |
| In lucru | `IN_PROGRESS` | nu |
| Finalizate | `DONE` | **da** |
| Aprobate | `APPROVED` | nu |

Coloanele sunt editabile de admin (CRUD), inclusiv schimbarea tipului → fluxul e perischimbabil.
Coloanele noi create manual sunt `CUSTOM` implicit.

### Fluxul cu butoane

Scenariul standard:

```
Backlog → (team lead repartizează) → membrul apasă „Planifică" (estimare + zi/oră)
       → Planned → „Ia în lucru" → In Progress → „Done" → Done
       → „Approve" (DOAR team lead) → Approved
```

Tranzițiile se fac prin **un singur endpoint**, care găsește coloana țintă după `column_type`:

```
POST /api/projects/{id}/board/tasks/{taskId}/transition
body: { action: "plan" | "start" | "done" | "approve",
        estimateMinutes?, dayOfWeek?, scheduledDate?, reminderTime? }
```

Permisiuni (vezi `board_service.transition_task`):
- `plan` / `start` / `done` → **assignee SAU team lead** (ADMIN+).
- `approve` → **doar team lead** (ADMIN+). Altfel 403 „Doar team lead-ul poate aproba".

La `plan` se setează estimarea + planificarea (`estimated_minutes`, `day_of_week`, `scheduled_date`,
`reminder_time` — câmpuri care existau deja și sunt refolosite).

### Drag & drop, assignee, labels

- **Mutare manuală** (drag&drop, persistat): `POST /api/projects/{id}/board/tasks/{taskId}/move` cu
  `{ toColumnId, toIndex }`. Frontend-ul (`@dnd-kit`) face mutare optimistă și nu aplică poll-ul în timpul
  unui drag în curs.
- **Assignee**: `PUT /api/projects/{id}/board/tasks/{taskId}/assign` cu `{ assigneeId }` (MEMBER+).
  Adaugă automat assignee-ul ca watcher și îi trimite notificare Telegram.
- **Labels**: per proiect (`Label` + `TaskLabel`). `GET/POST /api/projects/{id}/board/labels`,
  `DELETE .../labels/{labelId}` (creare/ștergere = ADMIN+).

### Board API (rezumat)

```
GET    /api/projects/{id}/board?sprint_id=...   # board complet (coloane + taskuri); folosit la polling
POST   /api/projects/{id}/board/columns         # ADMIN+
PUT    /api/projects/{id}/board/columns/{cid}   # ADMIN+
DELETE /api/projects/{id}/board/columns/{cid}   # ADMIN+
POST   /api/projects/{id}/board/tasks           # MEMBER+
PUT    /api/projects/{id}/board/tasks/{tid}     # MEMBER+
DELETE /api/projects/{id}/board/tasks/{tid}     # ADMIN+
POST   /api/projects/{id}/board/tasks/{tid}/move
PUT    /api/projects/{id}/board/tasks/{tid}/assign
POST   /api/projects/{id}/board/tasks/{tid}/transition
```

Forma unui task de board (camelCase, vezi `board.board_task_to_dict`): `id, title, description, priority,
assignee{userId,username,fullName}, labels[], boardColumnId, boardOrder, taskNumber, taskKey, dueDate,
estimateMinutes, storyPoints, sprintId, dayOfWeek, scheduledDate, reminderTime, commentCount`.

### Integrarea în pagina principală

Taskurile repartizate userului curent (din toate proiectele) apar și pe home, separat de grila personală:

```
GET /api/tasks/assigned   # board tasks cu assignee_id == eu, cu project{key,name,color}, taskNumber, columnType, schedule
```

View-ul săptămânal rămâne pe completions; repartizatele apar ca grup distinct, userul își pune singur
ziua/ora prin „Planifică".

---

## 5. Backlog & Sprinturi

- **Backlog** = taskuri de board (`board_column_id` setat) **fără sprint** (`sprint_id IS NULL`):
  `GET /api/projects/{id}/backlog`.
- **Sprint** (`Sprint`: `name, goal, start_date, end_date, status`) cu status `PLANNED | ACTIVE | COMPLETED`.

Endpointuri sprinturi (`backend/app/api/sprints.py`):

```
GET    /api/projects/{id}/sprints                       # VIEWER+
POST   /api/projects/{id}/sprints                       # ADMIN+
PUT    /api/projects/{id}/sprints/{sid}                 # ADMIN+
DELETE /api/projects/{id}/sprints/{sid}                 # ADMIN+ (taskurile revin în backlog)
POST   /api/projects/{id}/sprints/{sid}/start           # ADMIN+ -> ACTIVE
POST   /api/projects/{id}/sprints/{sid}/complete        # ADMIN+ -> COMPLETED (taskurile neterminate revin în backlog)
POST   /api/projects/{id}/sprints/{sid}/tasks/{tid}     # adaugă task în sprint
DELETE /api/projects/{id}/sprints/{sid}/tasks/{tid}     # scoate task din sprint
```

La **complete**, taskurile care NU sunt în coloană `DONE`/`APPROVED` revin automat în backlog.

### Capacitate pe persoană & avertizare la depășire

Fiecare membru are o **capacitate** (`ProjectMember.capacity_points`, puncte/sprint), editabilă de ADMIN+
sau de el însuși (prin `PUT .../members/{userId}` cu `capacityPoints`).

Răspunsul de la `GET .../sprints` include, per membru, `points` (suma story points alocate în sprint),
`capacityPoints` și flagul **`overCapacity`** (`points > capacity`).

Când adaugi un task într-un sprint, răspunsul conține un `warning` cu starea capacității assignee-ului:
`{ overCapacity, assigneePoints, capacityPoints }` — frontend-ul avertizează la depășire.

---

## 6. Story points & estimare AI

Taskurile au **story points 1–10** (`Task.story_points`, clamp 1..10).

### Wizard AI

Flux în 3 pași (frontend: `AiTaskWizard.tsx`):

1. **Întrebări** — `POST /api/ai/task-questions` cu `{ title, description? }` → 3–5 întrebări scurte de
   clarificare (în română).
2. **Răspunsuri** — userul completează.
3. **Estimare** — `POST /api/projects/{id}/ai/estimate` cu `{ title, description?, answers }` (MEMBER+) →
   `{ storyPoints, rationale, shouldSplit, suggestedSubtasks[], source }`.
   La > 8 puncte, `shouldSplit = true` și se recomandă 2–4 subtaskuri.

Opțional, creezi direct taskul din estimare: `POST /api/projects/{id}/ai/create-task` (pune taskul în
coloana `BACKLOG` dacă nu specifici `columnId`).

### Integrarea OpenRouter (compatibil OpenAI)

AI-ul folosește **OpenRouter** (gateway OpenAI-compatibil, chat completions). Vezi `ai_service.py`.

Variabile de mediu:

| Variabilă | Default | Rol |
|-----------|---------|-----|
| `OPENROUTER_API_KEY` | `""` (gol) | dacă lipsește → fallback pe reguli |
| `OPENROUTER_MODEL` | `openai/gpt-oss-20b:free` | modelul folosit |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | endpoint-ul |

Cererea trimite `response_format: {type: json_object}`, `temperature 0.2`, timeout 30s. Răspunsul e parsat
ca JSON strict (cu strip de code fences).

### Fallback pe reguli (euristici)

Calea AI **nu aruncă niciodată** către client. La orice problemă — **cheie lipsă**, **eroare de rețea**,
**rate-limit (HTTP 429)** sau JSON invalid — se cade pe euristici locale deterministe (`_rule_estimate`):
scor din lungimea textului + cuvinte-cheie de complexitate (`complex`, `dependență`, `refactor`, `migr`,
`securitate`, ...), tot pe scara 1–10, cu `source: "rules"`.

> Notă practică: pe **free tier** (`...:free`) răspunsurile 429 sunt frecvente → în practică estimarea
> cade des pe euristici. E așteptat; dacă vrei AI consistent, pune o cheie pe un model plătit.

Câmpul `source` (`"ai"` / `"rules"`) din răspuns spune ce cale s-a folosit — util pentru debug și pentru a
afișa userului dacă estimarea e AI sau euristică.

---

## 7. Performanță

Dashboard la nivel de proiect: `GET /api/projects/{id}/performance` (VIEWER+). Vezi `performance_service.py`.
„Munca terminată" = task într-o coloană cu tip `DONE` sau `APPROVED`.

Răspuns:
- **`perMember[]`**: `{ userId, username, completedPoints, completedTasks, assignedPoints, completionRate }`
  (completion rate = puncte finalizate / puncte alocate).
- **`sprints[]`**: per sprint `{ sprintId, name, status, committedPoints, completedPoints }` → **velocity**.
- **`totals`**: `{ totalCompletedPoints, totalCommittedPoints }`.

Frontend: `PerformancePanel.tsx` + `usePerformance` (grafice cu `recharts`).

---

## 8. Colaborare

Modulul de colaborare (`collaboration_service.py`, Faza 3B) acoperă comentarii, @mention, watchers și
activity log. Drawer-ul `TaskDetailDrawer.tsx` le adună pe toate într-un singur loc.

### Comentarii

```
GET    /api/tasks/{tid}/comments
POST   /api/tasks/{tid}/comments          body: { body }
PUT    /api/tasks/{tid}/comments/{cid}    body: { body }
DELETE /api/tasks/{tid}/comments/{cid}
```

### @mention → Telegram

În corpul comentariului, `@username` (regex `@(\w+)`) e detectat și rezolvat la membrii proiectului.
Persoanele menționate (și watcherii, mai puțin autorul) primesc o **notificare pe Telegram**, best-effort:

- doar dacă au `telegram_chat_id`;
- **respectă** toggle-ul Telegram al userului și fereastra **„Nu deranja"** (prin
  `reminder_service._telegram_allowed`);
- trimis async (`asyncio.create_task`), fără să arunce niciodată dacă nu există event loop.

### Watchers

```
POST   /api/tasks/{tid}/watch
DELETE /api/tasks/{tid}/watch
GET    /api/tasks/{tid}/watchers
```

Assignee-ul devine watcher automat la atribuire. Watcherii primesc notificări la comentarii.

### Activity log

Acțiuni înregistrate (`TaskActivity`: `CREATED / MOVED / ASSIGNED / COMMENTED / PLAN / START / DONE / APPROVE / ...`):

```
GET /api/tasks/{tid}/activity
GET /api/projects/{id}/activity?limit=50
```

---

## 9. Cum rulezi & testezi

Pornire (ca tot proiectul — prin Docker, nu rula `uvicorn`/`vite` pe host):

```bash
docker compose up --build        # primul start
docker compose up -d --build     # background
docker compose logs -f backend   # debug backend / bot / AI
```

**Migrările (015 → 019) se aplică automat** la pornire prin `backend/start.sh`
(`alembic upgrade head` înainte de uvicorn). Lanțul: `015_project_members` → `016_board` → `017_workflow`
→ `018_sprints` → `019_collaboration`. Nu trebuie să le rulezi manual decât dacă schimbi schema în timpul
lucrului:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend alembic current        # ar trebui să arate 019
```

### Teste

**Backend (pytest)** — există suită pentru codul Jira nou, în `backend/tests/`:
`test_membership_service.py`, `test_project_service.py`, `test_members_api.py`, `test_board_service.py`,
`test_board_transition.py`, `test_weekly_isolation.py`, `test_board_api.py`.

Rulează pe **SQLite în memorie** (fără Postgres) prin fixtures din `conftest.py`. Config în
`backend/pytest.ini` cu `--cov-fail-under=80` pe pachetele noi (`membership_service`, `project_service`,
`api.members`).

```bash
docker compose exec backend pytest                  # rulează suita + coverage
docker compose exec backend pytest tests/test_board_transition.py -q
```

**Frontend (Vitest)** — există suită în `frontend/` (config `vitest.config.ts`, setup `src/test/setup.ts`).
Acoperă logica nouă pură: `shared/utils/dates.ts` (`relativeTime`), `features/projects/components/mention.ts`,
`boardConstants.ts`, `hooks/applyOptimisticMove.ts`, plus un render-test pe `PerformancePanel`.

```bash
docker compose exec frontend npm run test         # rulează testele
docker compose exec frontend npm run test:cov     # cu coverage
```

Typecheck / build frontend:

```bash
docker compose exec frontend npx tsc -b
docker compose exec frontend npm run build
```

---

## 10. PWA pe telefon

Service worker-ul (necesar pentru „Add to Home Screen" / install pe Android) **cere HTTPS**. Pe LAN, peste
HTTP simplu (ex. `http://192.168.x.x`), instalarea PWA **nu merge**. Opțiuni:

- **Tunel HTTPS rapid** (cel mai simplu pentru test): `cloudflared tunnel --url http://localhost` sau
  `ngrok http 80` → primești un URL `https://...` care merge pe telefon.
- **HTTPS local permanent**: nginx pe 443 + certificat de dezvoltare cu `mkcert` (instalezi CA-ul mkcert
  pe telefon ca să fie de încredere).

Pentru install pe Android e nevoie și de **iconițe PNG** valide în manifest (Android nu acceptă doar SVG
pentru icon-ul de install). Pe iPhone/iPad merge direct: Safari → Share → „Add to Home Screen".

---

## 11. Variabile de mediu

Noi (pentru modulul Jira / AI):

| Variabilă | Default | Descriere |
|-----------|---------|-----------|
| `OPENROUTER_API_KEY` | `""` | cheia OpenRouter; gol → AI cade pe euristici |
| `OPENROUTER_MODEL` | `openai/gpt-oss-20b:free` | modelul de estimare |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | endpoint-ul gateway-ului |

Existente, relevante (din `CLAUDE.md` / `backend/app/core/config.py`):

| Variabilă | Default | Descriere |
|-----------|---------|-----------|
| `TELEGRAM_BOT_TOKEN` | — | bot principal (notificări @mention/assign, 2FA) |
| `ADMIN_TELEGRAM_BOT_TOKEN` | `""` | bot admin opțional (fallback la cel main) |
| `TELEGRAM_CHAT_ID` | — | chat-ul pentru seed-ul admin inițial |
| `APP_PIN` | `1111` | PIN-ul inițial al admin-ului |
| `JWT_SECRET` | — | secret JWT (string random lung) |
| `JWT_EXPIRE_HOURS` | `12` | durata sesiunii |
| `ADMIN_USERNAME` | `admin` | username admin seedat |
| `DATABASE_URL` | postgres local | conexiunea Postgres |
| `FRONTEND_URL` | — | URL frontend (linkuri) |

Există un `.env.example` versionat (cu placeholder-e, inclusiv `OPENROUTER_*`) — copiază-l în `.env` și completează valorile reale.

---

## 12. Modificări recente & depanare (pentru viitor)

### Ce s-a adăugat/reparat în ultima rundă

- **AI Sprint Planner** — scrii liber tot ce trebuie făcut într-un sprint, AI-ul îl desparte în taskuri IT bine formate (titlu/descriere/criterii + story points), le vezi într-o listă **editabilă**, apoi le creezi pe toate în backlog. Buton „✨ Planifică sprint (AI)" în Backlog.
  - `POST /api/projects/{id}/ai/plan` (preview, nu creează nimic) → `{ tasks:[{title,description,storyPoints}], source }`.
  - `POST /api/projects/{id}/ai/plan/apply` → creează toate în coloana `BACKLOG`. Aceeași cale de fallback pe reguli ca restul AI-ului.
- **„Done" robust la personalizarea coloanelor** — detecția „terminat" (performanță, velocity, complete-sprint, tranziția `done`) ține cont acum și de flag-ul `BoardColumn.is_done_column`, nu doar de `column_type`. Helper: `board_service.is_done_column_obj` / `done_column_ids`. **Practic:** dacă schimbi tipul coloanei „Finalizate" în CUSTOM, bifează-o ca „coloană finală" (`is_done_column`) ca statisticile să rămână corecte.
- **VIEWER e strict read-only** — nu poate fi asignat la taskuri (400 „Nu poti atribui sarcini unui vizualizator") și nu poate face tranziții (403). Pentru muncă, ridică-l la MEMBER.
- **Tab „Activitate" pe proiect** — feed-ul `GET /api/projects/{id}/activity` e acum afișat în UI (`ActivityPanel.tsx`).
- **OpenRouter** integrat (vezi §6) în locul SDK-ului Anthropic; cheie în `.env`.
- **Reparat** typo `FRONTEND_URL` (`http:/o/...` → `http://...`) și conflictul de dependențe `httpx`/`python-telegram-bot` care bloca build-ul Docker.

### Depanare — probleme frecvente și soluții

| Simptom | Cauză | Soluție |
|--------|-------|---------|
| `telegram.error.Conflict: terminated by other getUpdates` în logurile backend | Două instanțe ale botului folosesc același `TELEGRAM_BOT_TOKEN` (polling dublu) | Oprește cealaltă instanță (alt `docker compose` / server) sau folosește un token separat. API-ul funcționează oricum. |
| Estimarea AI iese mereu „pe reguli" (`source: "rules"`) | Lipsă `OPENROUTER_API_KEY`, rețea, sau **429** pe model `:free` | Pune o cheie validă; pentru AI consistent folosește un model plătit în `OPENROUTER_MODEL`. Comportamentul de fallback e intenționat. |
| Dashboard performanță / velocity arată 0; taskuri „gata" revin în backlog la complete-sprint | Coloana de final nu mai e tip `DONE`/`APPROVED` și nici bifată `is_done_column` | Bifează coloana finală ca „coloană finală" în editorul de coloană, sau păstrează tipul `DONE`. |
| PWA nu se instalează / dă erori pe telefon | Service worker cere HTTPS; pe LAN HTTP nu pornește; iconițe SVG | Servește prin HTTPS (tunel `cloudflared`/`ngrok` sau nginx 443 + `mkcert`) și adaugă iconițe **PNG** 192/512 în manifest. |
| Tokenuri JWT „nu țin" / cont compromis | `JWT_SECRET` rămas pe default | Setează un `JWT_SECRET` random lung în `.env` și repornește. |
| Linkuri Telegram/deep-link greșite | `FRONTEND_URL` necompletat în `.env` | Pune URL-ul real al frontend-ului. |
| Migrare nouă nu s-a aplicat | `alembic upgrade head` rulează la boot prin `start.sh` | `docker compose exec backend alembic current` (trebuie `019`); dacă nu, `alembic upgrade head`. |

### De rezolvat pe viitor (rămase din audit, neblocante)

- **i18n**: ecranele vechi `ProjectsPage.tsx`, `ProjectDetailPage.tsx`, `AddProjectModal.tsx` au texte RO hardcodate (userii RU le văd în română) — de trecut prin `t()`.
- **Single-ACTIVE-sprint**: `start_sprint` nu împiedică două sprinturi ACTIVE simultan; adaugă o verificare dacă vrei un singur sprint activ.
- **`overCapacity` zgomotos** când capacitatea e 0 (netsetată) — tratează 0 ca „nesetat / fără avertizare".
- **Securizare înainte de producție**: schimbă `ADMIN_PASSWORD`, `APP_PIN`, credențialele DB (`taskuser:taskpass`); ignoră `backend/.coverage` în git (artefact de build).
- **AI Sprint Planner** pune taskurile în backlog (nu direct în sprint, by design) — apoi le tragi manual în sprint.
