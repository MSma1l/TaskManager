# 06 — Baza de date (PostgreSQL)

TaskManager folosește **PostgreSQL 15** ca singură sursă de adevăr pentru toate cele trei suprafețe (Web App, REST API, Telegram Bot).

Schema este versionată **exclusiv prin Alembic**. **Niciodată** nu modifici tabelele manual (`ALTER TABLE` direct în `psql`, modificări ad-hoc etc.) — orice schimbare de schemă trece printr-o **migrare**. Migrările trăiesc în [`backend/alembic/versions/`](../backend/alembic/versions/) și formează un lanț liniar de la `001` la `034`.

La fiecare pornire a containerului, [`backend/start.sh`](../backend/start.sh):

1. așteaptă ca Postgres să fie gata;
2. rulează `alembic upgrade head` (aplică toate migrările lipsă);
3. rulează `python seed.py` (seed idempotent — admin inițial, categorii etc.);
4. pornește `uvicorn --reload`.

Nu trebuie să rulezi nimic manual decât dacă schimbi schema în timpul lucrului (vezi [Backend](04-backend.md) pentru comenzile Alembic).

> [!NOTE]
> Există un dump de referință [`taskmanager_backup.sql`](../taskmanager_backup.sql) la rădăcină — util pentru date de test, **dar nu este sursa de adevăr pentru schemă**. Alembic este canonic.

---

## Convenții

Aceste convenții se aplică **transversal** întregii scheme. Le respecți obligatoriu când adaugi un model nou.

### Cheia primară: CUID `String(25)`

PK-urile **nu** sunt integer auto-increment și **nu** sunt UUID-uri standard. Sunt CUID-uri stocate ca `String` și generate de utilitarul existent:

```python
# backend/app/models/base.py
def generate_cuid():
    return str(uuid.uuid4()).replace("-", "")[:25]
```

Fiecare model declară PK-ul astfel:

```python
id = Column(String, primary_key=True, default=generate_cuid)
```

Tabelele de legătură many-to-many (`task_assignees`, `task_watchers`, `task_labels`) folosesc în schimb o **PK compusă** pe cele două coloane FK.

### Soft-delete prin `is_active` / `is_deleted`

Nu există `DELETE FROM` în fluxul normal. Ștergerea înseamnă setarea unui flag:

- majoritatea modelelor folosesc `is_active = False` (`tasks`, `projects`, `categories` implicit, `bug_reports`, `quick_tasks`, `report_shares`…);
- modelele de calendar / notebook folosesc `is_deleted = True` (`calendar_events`, `nb_topics`, `nb_notes`, `nb_sketches`).

Query-urile filtrează implicit `is_active == True` (respectiv `is_deleted == False`). **Excepție notabilă**: finalizarea unui proiect face *hard delete* real pe taskurile arhivate — vezi secțiunea [Lifecycle: finalizare proiect](#lifecycle-finalizare-proiect-hard-delete).

Modele **fără** soft-delete (ștergere efectivă sau flag de stare diferit): `task_comments`, `task_activities`, `notifications` (`is_read`), `push_subscriptions`, `friendships` (`status`), `login_codes`, `qr_sessions`, `reminder_logs`.

### `camelCase` la API, `snake_case` în DB

Coloanele DB sunt `snake_case` (`assignee_id`, `story_points`, `board_column_id`). Schemele Pydantic / payload-urile JSON expuse de API folosesc `camelCase` (`assigneeId`, `storyPoints`, `boardColumnId`). Maparea se face în `schemas/` și `services/`.

### Alte convenții

- **Enum-uri ca string** — statusurile sunt stocate ca `String` cu comentariu în model (ex. `status = Column(String(20), ...)  # ACTIVE | ON_HOLD | ARCHIVED`), nu ca tip `ENUM` Postgres. Singura excepție este `TaskCompletion.status` care folosește un `Enum(TaskStatus)` SQLAlchemy.
- **Recurența calendarului** este expandată **la query**, nu la insert: DB stochează un singur rând cu `recurrence_rule` + `recurrence_until`, iar ocurențele sunt calculate în view.
- **Imagini / audio** (schițe, atașamente bug, atașamente Quick Task) sunt stocate inline ca **data URL base64** în coloane `Text` / `JSON`, nu pe disc.

---

## Modele / tabele

### `users` — utilizatori

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `username` | String(50) | unique, NOT NULL, index |
| `email` | String(150) | unique, nullable, index |
| `full_name` | String(150) | nullable |
| `phone` | String(40) | nullable |
| `telegram_chat_id` | String(50) | nullable, index — legat prin `/link <cod>` |
| `role` | String(20) | `USER` \| `ADMIN`, default `USER` |
| `pin_hash` | String(200) | PIN personal pentru re-login fără cod |
| `password_hash` | String(200) | adminii se loghează cu user+parolă (sar peste 2FA Telegram) |
| `calendar_token` | String(64) | unique, index — bearer pentru feed-ul iCal `.ics` read-only |
| `is_active` | Boolean | soft-delete, default `True` |
| `last_login_at` | DateTime | nullable |
| `failed_login_attempts` | Integer | contor lockout brute-force |
| `locked_until` | DateTime | nullable — fereastră de blocare |
| `token_version` | Integer | revocare JWT (incrementat → invalidează tokenele vechi) |
| `must_change_password` | Boolean | forțează schimbarea parolei |
| `theme` | String(20) | `dark` \| `light` (sync între device-uri) |
| `language` | String(5) | `ro` \| `ru` |
| `notification_settings` | JSON | `{telegram, web, doNotDisturbStart, doNotDisturbEnd, defaultReminderMinutes}` |
| `created_at` / `updated_at` | DateTime | |

### `login_codes` — coduri 2FA de unică folosință

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `user_id` | String | index |
| `code_hash` | String(200) | cod de 6 cifre, hash-uit |
| `purpose` | String(20) | `login` \| `refresh` \| `admin` |
| `attempts` | Integer | default 0 |
| `used_at` | DateTime | nullable |
| `expires_at` | DateTime | NOT NULL |
| `created_at` | DateTime | |

### `tasks` — taskuri (weekly + board)

Modelul central. Acoperă atât taskurile săptămânale recurente, cât și cardurile de board (Kanban / Jira-like).

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `user_id` | String → `users.id` | nullable, index — proprietarul / creatorul |
| `title` | String | NOT NULL |
| `description` | Text | nullable |
| `category_id` | String → `categories.id` | nullable — culoarea/iconița vin din categorie |
| `day_of_week` | Integer | 1=Luni … 7=Duminică (weekly) |
| `scheduled_date` | DateTime | nullable |
| `reminder_time` | String | `"HH:MM"` — folosit de scheduler |
| `is_recurring` | Boolean | default `False` |
| `is_active` | Boolean | soft-delete |
| `priority` | String | `LOW` \| `MEDIUM` \| `HIGH`, default `MEDIUM` |
| `estimated_minutes` | Integer | nullable |
| `due_date` | DateTime | nullable |
| `project_id` | String → `projects.id` | nullable |
| `board_column_id` | String → `board_columns.id` | nullable, index — coloana de board |
| `board_order` | Integer | ordonare manuală în coloană |
| `assignee_id` | String → `users.id` | nullable, index — **responsabil primar** |
| `task_number` | Integer | secvențial per proiect → cheia `KEY-<task_number>` |
| `story_points` | Integer | estimare efort 1–10; **default 1** la taskuri noi de board |
| `sprint_id` | String → `sprints.id` | nullable, index |
| `approval_status` | String(20) | nullable, index — `NULL` \| `PENDING_REVIEW` \| `NEEDS_FIX` \| `APPROVED` \| `REJECTED` |
| `origin` | String(20) | `NULL` = normal \| `"QUICK"` = creat dintr-un Quick Task public |
| `subtasks` | JSON | checklist: listă de `{"id": cuid, "title": str, "done": bool}`, ordonată |
| `archived_at` | DateTime | setat când taskul intră într-o coloană `APPROVED` (Verificat); șters la ieșire |
| `created_at` / `updated_at` | DateTime | |

**Relații:**

- `category` (many-to-one) → `Category`
- `completions` (one-to-many) → `TaskCompletion`
- `project` (many-to-one) → `Project`
- `labels` (many-to-many, prin `task_labels`) → `Label`
- `assignees` (many-to-many, prin `task_assignees`) → `User` — **responsabili multipli**

> [!IMPORTANT]
> **Două mecanisme de responsabilitate coexistă**: `assignee_id` (responsabilul *primar*, o singură persoană, folosit de Weekly View) și relația `assignees` (many-to-many prin `task_assignees`, pentru atribuiri multiple pe board). Migrarea `033` a făcut backfill: pentru fiecare task cu `assignee_id` setat a inserat un rând în `task_assignees`.

### `task_completions` — status per task per săptămână

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `task_id` | String → `tasks.id` | NOT NULL |
| `week_start` | DateTime | NOT NULL — luni-ul săptămânii |
| `status` | Enum(TaskStatus) | `PENDING` \| `DONE` \| `SKIPPED` \| `NOT_DONE`, default `PENDING` |
| `completed_at` | DateTime | nullable |
| `moved_to_date` | DateTime | nullable — reprogramare |
| `skip_reason` | Text | **obligatoriu pentru `NOT_DONE`** |
| `note` | Text | nullable |
| `created_at` / `updated_at` | DateTime | |

> [!IMPORTANT]
> Constrângere **`UNIQUE(task_id, week_start)`** (`uq_task_completion_week`, definită în migrarea `001`): un singur status per task per săptămână. `NOT_DONE` cere `skip_reason` obligatoriu.

### `task_assignees` — responsabili multipli (M:N)

| Coloană | Tip | Note |
|---|---|---|
| `task_id` | String → `tasks.id` | **PK compus**, index |
| `user_id` | String → `users.id` | **PK compus**, index |
| `created_at` | DateTime | |

Tabel de legătură pentru atribuirile multiple. Vezi nota de la `tasks` despre coexistența cu `assignee_id`.

### `task_watchers` — observatori (M:N)

| Coloană | Tip | Note |
|---|---|---|
| `task_id` | String → `tasks.id` | **PK compus**, index |
| `user_id` | String → `users.id` | **PK compus**, index |
| `created_at` | DateTime | |

Utilizatorii care urmăresc un task primesc notificări la comentarii noi.

### `task_comments` — comentarii

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `task_id` | String → `tasks.id` | NOT NULL, index |
| `user_id` | String → `users.id` | NOT NULL — autorul |
| `body` | Text | NOT NULL |
| `created_at` / `updated_at` | DateTime | fără soft-delete |

### `task_activities` — jurnal de activitate

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `task_id` | String → `tasks.id` | NOT NULL, index |
| `project_id` | String → `projects.id` | NOT NULL, index |
| `user_id` | String → `users.id` | nullable — actorul (poate fi sistemul) |
| `action` | String(40) | `CREATED` \| `MOVED` \| `COMMENTED` … |
| `meta` | JSON | context |
| `created_at` | DateTime | index |

### `categories` — categorii de taskuri

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `name` | String | NOT NULL |
| `icon` | String | NOT NULL |
| `color` | String | NOT NULL |
| `created_at` | DateTime | |

Relație: `tasks` (one-to-many). Culoarea/iconița se auto-aplică pe taskuri — nu se duplică pe task.

### `projects` — proiecte

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `user_id` | String → `users.id` | nullable, index — proprietarul legacy |
| `name` | String | NOT NULL |
| `description` | Text | nullable |
| `github_url` | String | nullable |
| `color` | String | default `#3b82f6` |
| `key` | String(10) | cheia proiectului (ex. `IA`) pentru numerotarea taskurilor: `IA-1`, `IA-2`… |
| `task_counter` | Integer | NOT NULL, default 0 — contor secvențial per proiect |
| `status` | String(20) | `ACTIVE` (În Dezvoltare) \| `ON_HOLD` (Așteptare Detalii) \| `ARCHIVED` (Finalizat) |
| `system_key` | String(20) | nullable, index — `"OFFICE"` pentru proiectul de sistem **«Birou»**; `NULL` la proiectele obișnuite |
| `is_active` | Boolean | soft-delete |
| `created_at` / `updated_at` | DateTime | |

**Relații:** `tasks` (one-to-many), `members` (one-to-many → `ProjectMember`, `cascade="all, delete-orphan"`).

> [!NOTE]
> `system_key = "OFFICE"` identifică proiectul special **«Birou»** (introdus în migrarea `034`). E partajat și tratat diferit față de proiectele obișnuite ale userilor.

### `project_members` — membri de proiect (roluri)

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `project_id` | String → `projects.id` | NOT NULL, index |
| `user_id` | String → `users.id` | NOT NULL, index |
| `role` | String(20) | `OWNER` \| `ADMIN` \| `MEMBER` \| `VIEWER`, default `MEMBER` |
| `capacity_points` | Integer | NOT NULL, default 10 — capacitate (story points) per sprint |
| `invited_by` | String → `users.id` | nullable |
| `created_at` | DateTime | |

Constrângere: **`UNIQUE(project_id, user_id)`** (`uq_project_member`). Accesul la un proiect e determinat de membership, nu doar de `projects.user_id`.

### `board_columns` — coloane Kanban

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `project_id` | String → `projects.id` | NOT NULL, index |
| `name` | String | NOT NULL |
| `position` | Integer | NOT NULL, default 0 |
| `color` | String | nullable |
| `is_done_column` | Boolean | NOT NULL, default `False` |
| `column_type` | String(20) | `BACKLOG` \| `PLANNED` \| `IN_PROGRESS` \| `VERIFY` \| `DONE` \| `APPROVED` \| `CUSTOM` |
| `created_at` | DateTime | |

`column_type` corespunde enum-ului `ColumnType` din `models/base.py`. `VERIFY` = „În Așteptare Verificare", `APPROVED` = „Verificat" (declanșează `archived_at` pe task).

### `labels` + `task_labels` — etichete

**`labels`:**

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `project_id` | String → `projects.id` | NOT NULL, index |
| `name` | String | NOT NULL |
| `color` | String | NOT NULL, default `#3b82f6` |
| `created_at` | DateTime | |

**`task_labels`** (M:N):

| Coloană | Tip | Note |
|---|---|---|
| `task_id` | String → `tasks.id` | **PK compus**, index |
| `label_id` | String → `labels.id` | **PK compus**, index |

### `sprints` — sprinturi

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `project_id` | String → `projects.id` | NOT NULL, index |
| `name` | String | NOT NULL |
| `goal` | Text | nullable |
| `start_date` / `end_date` | DateTime | nullable |
| `status` | String(20) | `PLANNED` \| `ACTIVE` \| `COMPLETED`, default `PLANNED` |
| `closed_at` | DateTime | nullable |
| `report` | JSON | raport auto-generat la închidere (snapshot: totaluri, per-user, burndown) |
| `created_at` | DateTime | |

### `calendar_events` — evenimente calendar

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `user_id` | String | NOT NULL, index — owner-ul |
| `title` | String(200) | NOT NULL |
| `description` | Text | nullable |
| `color` | String(20) | default `#3b82f6` |
| `event_type` | String(20) | `personal` \| `meeting_online` \| `meeting_in_person` \| `appointment` \| `reminder` \| `task` |
| `location` | String(255) | nullable |
| `meeting_url` | String(500) | nullable |
| `is_all_day` | Boolean | default `False` |
| `event_status` | String(20) | `CONFIRMED` \| `TENTATIVE` \| `CANCELLED` |
| `attendance_status` | String(20) | `PENDING` \| `ATTENDED` \| `MISSED` \| `AUTO_ATTENDED` (doar pentru evenimente trecute) |
| `attendance_note` | Text | nullable |
| `recurrence_rule` | String(20) | `DAILY` \| `WEEKLY` \| `MONTHLY` \| `None` — **expandat la query** |
| `recurrence_until` | Date | nullable |
| `reminder_minutes` | JSON | offset-uri multiple, ex. `[15, 60]` |
| `attendees` | JSON | listă `[{name, email, telegramChatId}]` (invitați „liberi", nu useri) |
| `category_id` | String → `event_categories.id` | nullable |
| `event_date` | Date | NOT NULL |
| `start_time` / `end_time` | String(5) | `"08:00"` / `"09:30"` |
| `is_deleted` | Boolean | soft-delete (calendar) |
| `created_at` / `updated_at` | DateTime | |

> Nu există un model `CalendarReminder` separat: remindere-le sunt offset-urile din `reminder_minutes` (JSON), iar anti-duplicarea se face prin `calendar_reminder_logs`.

### `event_categories` — categorii de evenimente

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `user_id` | String | NOT NULL, index |
| `name` | String(80) | NOT NULL |
| `color` | String(20) | NOT NULL, default `#3b82f6` |
| `icon` | String(20) | nullable |
| `is_visible` | Boolean | default `True` |
| `is_default` | Boolean | default `False` |
| `sort_order` | String(10) | nullable |
| `created_at` / `updated_at` | DateTime | |

### `calendar_event_attendees` — participanți reali (useri)

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `event_id` | String → `calendar_events.id` | NOT NULL, index |
| `user_id` | String → `users.id` | NOT NULL, index |
| `status` | String(20) | `INVITED` \| `ACCEPTED` \| `DECLINED` |
| `created_at` / `updated_at` | DateTime | |

Distinct de `calendar_events.attendees` (JSON, invitați „liberi"). Aici sunt **utilizatori reali** invitați; primesc notificare in-app `EVENT_INVITE` și văd evenimentul în propriul calendar.

### `calendar_reminder_logs` — anti-duplicare remindere calendar

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `event_id` | String | NOT NULL, index |
| `occurrence_date` | Date | NOT NULL — pentru evenimente recurente |
| `minutes_before` | String(10) | int stringificat |
| `channel` | String(20) | `telegram` \| `web` |
| `fired_at` | DateTime | NOT NULL |

### `reminder_logs` — anti-duplicare remindere task

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `task_id` | String | NOT NULL |
| `sent_at` | DateTime | |
| `channel` | String | `telegram` \| `web` |

### `nb_topics` — subiecte notebook

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `user_id` | String | NOT NULL — telegram chat_id sau user web |
| `name` | String(100) | NOT NULL |
| `description` | String(500) | nullable |
| `emoji` | String(10) | nullable |
| `is_predefined` | Boolean | default `False` |
| `is_deleted` | Boolean | soft-delete |
| `created_at` | DateTime | |

Relație: `notes` (one-to-many → `NotebookNote`).

### `nb_notes` — note notebook

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `user_id` | String | NOT NULL |
| `note_type` | String(20) | `step` \| `task` \| `idea` |
| `topic_id` | String → `nb_topics.id` | nullable |
| `content` | Text | NOT NULL |
| `step_order` | SmallInteger | nullable |
| `task_status` | String(20) | `todo` \| `in_progress` \| `done` |
| `is_deleted` | Boolean | soft-delete |
| `created_at` / `updated_at` | DateTime | |

Relații: `topic` (many-to-one), `history` (one-to-many → `NotebookNoteHistory`).

### `nb_note_history` — istoric ediții note

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `note_id` | String → `nb_notes.id` | NOT NULL, `ondelete="CASCADE"` |
| `content` | Text | NOT NULL |
| `edited_at` | DateTime | |

### `nb_sketches` — schițe (stylus / desen de mână)

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `user_id` | String | NOT NULL, index |
| `topic_id` | String → `nb_topics.id` | nullable |
| `title` | String(150) | nullable |
| `image_data` | Text | `data:image/png;base64,…` |
| `width` / `height` | Integer | nullable |
| `is_deleted` | Boolean | soft-delete |
| `created_at` / `updated_at` | DateTime | |

### `telegram_sessions` — stare conversații bot

| Coloană | Tip | Note |
|---|---|---|
| `chat_id` | String | **PK** (nu CUID — e chat_id-ul Telegram) |
| `state` | Text | JSON — pasul curent al conversației |
| `updated_at` | DateTime | |

### `qr_sessions` — login prin QR / Telegram

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `flow` | String(20) | `qr` (scan-to-login) \| `tglogin` (login din Telegram cu aprobare admin) |
| `status` | String(20) | `PENDING` → `AWAITING_ADMIN` → `APPROVED` / `REJECTED` / `EXPIRED` → `CONSUMED` |
| `user_id` | String | setat la aprobare |
| `access_request_id` | String | cererea de acces legată (flow `tglogin`) |
| `issued_token` | String | JWT scurt, returnat desktopului la poll |
| `token_expires_at` | DateTime | nullable |
| `expires_at` | DateTime | NOT NULL |
| `approved_at` / `consumed_at` | DateTime | nullable |
| `created_at` | DateTime | |

### `access_requests` — cereri de acces (sign-up public)

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `first_name` / `last_name` | String(100) | NOT NULL |
| `email` | String(150) | nullable |
| `phone` | String(40) | nullable |
| `telegram_chat_id` | String(50) | pre-completat când vine prin link bot |
| `purpose` | String(20) | `personal` \| `collective` |
| `reason` | Text | nullable |
| `status` | String(20) | `PENDING` \| `APPROVED` \| `REJECTED`, index |
| `rejection_reason` | Text | nullable |
| `processed_by_user_id` | String | nullable |
| `processed_at` | DateTime | nullable |
| `created_user_id` | String | populat după aprobare |
| `qr_session_id` | String | sesiunea web tglogin care așteaptă aprobarea |
| `source` | String(20) | `web` \| `personal` \| `collective` \| `telegram` |
| `desired_username` | String(50) | self-signup |
| `password_hash` / `pin_hash` | String(200) | aplicate la aprobare |
| `created_at` | DateTime | NOT NULL |

### `quick_tasks` — taskuri rapide (formular public)

Trimise din formularul **public** (fără login). Adminul le preia din inbox și le distribuie (proiect + responsabil), creând un `Task` real legat prin `task_id`.

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `requester_name` | String(150) | NOT NULL — „Nume + Prenume" pe o linie |
| `title` | String(300) | NOT NULL |
| `description` | Text | nullable |
| `priority` | String(20) | `URGENT` \| `NORMAL` \| `LATER` (Poate Aștepta) |
| `status` | String(20) | `NEW` \| `ASSIGNED` \| `DISMISSED`, index |
| `attachments` | JSON | screenshot-uri + mesaje vocale: listă `[{type: "image"|"audio", data: "data:…;base64,…", caption}]` |
| `project_id` | String → `projects.id` | nullable — completat la asignare |
| `assignee_id` | String → `users.id` | nullable — completat la asignare |
| `task_id` | String → `tasks.id` | nullable — taskul real creat |
| `processed_by_user_id` | String | nullable |
| `processed_at` | DateTime | nullable |
| `notified_at` | DateTime | anti-duplicare la notificarea admin (la fiecare minut) |
| `is_active` | Boolean | soft-delete |
| `created_at` | DateTime | NOT NULL |

### `notifications` — centru de notificări in-app

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `user_id` | String | NOT NULL, index — destinatarul |
| `type` | String(40) | `PROJECT_ADDED` \| `TASK_ASSIGNED` \| `EVENT_INVITE` … |
| `title` | String | NOT NULL |
| `body` | Text | nullable |
| `link` | String | rută frontend, ex. `/projects/<id>/board` |
| `meta` | JSON | `{projectId, taskId, actorId}` |
| `is_read` | Boolean | NOT NULL, index — fără soft-delete |
| `created_at` | DateTime | index |
| `read_at` | DateTime | nullable |

### `friendships` — colaboratori (prieteni / colegi)

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `requester_id` | String | NOT NULL, index — cine trimite cererea |
| `addressee_id` | String | NOT NULL, index — cine o primește |
| `status` | String(20) | `PENDING` \| `ACCEPTED` \| `REJECTED`, index |
| `relation` | String(20) | `friend` \| `colleague` |
| `created_at` | DateTime | NOT NULL |
| `responded_at` | DateTime | nullable |

Index compus `ix_friendships_pair (requester_id, addressee_id)`. **Fără UNIQUE** pe pereche — permite re-cererea după REJECT; unicitatea relației active e verificată în `friend_service`.

### `push_subscriptions` — abonamente Web Push (VAPID)

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `user_id` | String | NOT NULL, index |
| `endpoint` | Text | NOT NULL, **unique** — URL push service |
| `p256dh` | String | cheia publică de criptare a clientului |
| `auth` | String | secretul de autentificare |
| `created_at` | DateTime | index |

Fără soft-delete: la `410 Gone` sau dezabonare, rândul e șters efectiv. Un user poate avea mai multe abonamente (device-uri).

### `report_shares` — link-uri publice read-only pentru rapoarte

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `token` | String(40) | NOT NULL, unique, index |
| `scope` | String(20) | `team` (toate proiectele creatorului) \| `project` |
| `project_id` | String → `projects.id` | nullable (pentru scope `project`) |
| `label` | String(150) | nullable |
| `created_by` | String → `users.id` | nullable |
| `is_active` | Boolean | soft-delete |
| `created_at` | DateTime | NOT NULL |

### `bug_reports` — modul QA (rapoarte de testare)

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `project_id` | String → `projects.id` | NOT NULL, index |
| `title` | String(300) | NOT NULL |
| `description` | Text | nullable |
| `status` | String(20) | `OPEN` \| `IN_PROGRESS` \| `PASSED` \| `FAILED`, index |
| `severity` | String(20) | `LOW` \| `MEDIUM` \| `HIGH` \| `CRITICAL` |
| `steps` | JSON | checklist pași: `[{id, text, done, result: "pass"|"fail"|None}]` |
| `created_by` | String → `users.id` | nullable |
| `assignee_id` | String → `users.id` | nullable |
| `is_active` | Boolean | soft-delete |
| `created_at` / `updated_at` | DateTime | |

### `bug_report_attachments` — dovezi vizuale

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `bug_report_id` | String → `bug_reports.id` | NOT NULL, index, `ondelete="CASCADE"` |
| `image_data` | Text | `data:image/png;base64,…` |
| `caption` | String(300) | nullable |
| `created_by` | String → `users.id` | nullable |
| `created_at` | DateTime | NOT NULL |

### `bug_report_comments` — comentarii QA

| Coloană | Tip | Note |
|---|---|---|
| `id` | String(CUID) | PK |
| `bug_report_id` | String → `bug_reports.id` | NOT NULL, index, `ondelete="CASCADE"` |
| `user_id` | String → `users.id` | NOT NULL |
| `body` | Text | NOT NULL |
| `created_at` | DateTime | NOT NULL |

---

## Lifecycle: finalizare proiect (hard delete)

La finalizarea unui proiect (`POST` finalize → [`project_service.finalize_project`](../backend/app/services/project_service.py)), regula obișnuită de soft-delete **nu** se aplică pentru taskurile verificate:

1. Doar `OWNER` / `ADMIN` al proiectului poate finaliza.
2. Se selectează **taskurile arhivate** (cele cu `archived_at` setat, adică ajunse în coloana `APPROVED` / „Verificat").
3. Pentru aceste taskuri se **șterg DEFINITIV** (hard `DELETE`) rândurile copil, în ordine sigură față de FK:
   - `task_assignees`
   - `task_watchers`
   - `task_labels`
   - `task_comments`
   - `task_activities`
   - `task_completions`
4. `quick_tasks` care pointau spre aceste taskuri sunt **dezlegate** (`task_id` → `NULL`), ca să nu pice FK-ul.
5. Apoi se șterg **taskurile** însele (subtaskurile sunt JSON pe rândul taskului → pleacă cu el).
6. Proiectul trece pe `status = "ARCHIVED"`.

**Taskurile ne-arhivate NU se șterg.** Acesta este singurul flux care face `DELETE FROM` real pe taskuri și descendenții lor.

---

## Migrări

Lanț liniar `001 → 034` în [`backend/alembic/versions/`](../backend/alembic/versions/). Rezumat:

| # | Adaugă |
|---|---|
| `001` | Migrarea inițială: `users`-less core — `categories`, `tasks`, `task_completions` (cu `UNIQUE(task_id, week_start)`), `reminder_logs`, `telegram_sessions`. |
| `002` | `priority` + `estimated_minutes` pe `tasks`. |
| `003` | Tabela `projects` + `project_id` pe `tasks`. |
| `004` | Tabelele notebook (`nb_topics`, `nb_notes`, `nb_note_history`). |
| `005` | Tabela `calendar_events`. |
| `006` | `users` + `login_codes` (multi-user + 2FA). |
| `007` | Calendar stil Outlook: tipuri eveniment, attendees, recurență, multi-remindere, `event_categories`, `calendar_reminder_logs`. |
| `008` | `nb_sketches` (schițe stylus / desen de mână). |
| `009` | `password_hash` pe `users` (login admin cu parolă). |
| `010` | `access_requests` + coloana `phone` pe `users`. |
| `011` | `attendance_status` + `attendance_note` pe `calendar_events`. |
| `012` | `user_id` pe `tasks` + `projects` (izolare per-user; înainte erau partajate global). |
| `013` | `qr_sessions` (login prin scanare QR). |
| `014` | `language` pe `users` (`ro` / `ru`). |
| `015` | `project_members` (membership per proiect cu roluri). |
| `016` | Board Kanban: `board_columns`, `labels`, `task_labels` + câmpuri board pe `tasks`. |
| `017` | Workflow: `key` + `task_counter` pe proiect, `task_number` + `due_date` pe task. |
| `018` | `sprints` + `story_points` + `sprint_id` pe task + `capacity_points` pe membru. |
| `019` | Colaborare: `task_comments`, `task_activities`, `task_watchers`. |
| `020` | Întărire securitate: lockout brute-force, revocare token, `must_change_password` pe `users`. |
| `021` | tg-login: extinde `qr_sessions` (`flow`) + `access_requests` pentru login Telegram cu aprobare admin. |
| `022` | Self-signup cu username + parolă: `desired_username`, `password_hash`, `pin_hash` pe `access_requests`. |
| `023` | `notifications` (centru de notificări in-app). |
| `024` | `friendships` (colaboratori prieteni / colegi). |
| `025` | `subtasks` (checklist JSON) pe `tasks`. |
| `026` | `push_subscriptions` (Web Push VAPID). |
| `027` | `calendar_token` pe `users` (feed iCal `.ics` read-only). |
| `028` | `calendar_event_attendees` (participanți reali la evenimente). |
| `029` | Indici de performanță pe coloane fierbinți (`tasks.project_id` etc.). |
| `030` | PM platform: `projects.status`, `tasks.approval_status`, raport sprint, `quick_tasks`, `report_shares`. |
| `031` | Modul QA: `bug_reports`, `bug_report_attachments`, `bug_report_comments`. |
| `032` | `quick_tasks.attachments` (JSON — screenshot-uri + mesaje vocale base64). |
| `033` | `task_assignees` (atribuiri multiple M:N) + backfill din `assignee_id`. |
| `034` | `projects.system_key` (proiectul de sistem «Birou») + `tasks.origin` / `archived_at` (arhivare). |

---

## Vezi și

- [Backend](04-backend.md) — comenzile Alembic, arhitectura layered, services.
- [Funcționalități](10-features.md) — cum se traduc tabelele în fluxuri de produs.
