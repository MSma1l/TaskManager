# 10 — Plimbare prin funcționalități

Acest document parcurge funcționalitățile produsului **din perspectiva utilizatorului** (ce vede și ce poate face) și **din perspectiva implementării** (ce se întâmplă în spate). Fiecare secțiune e o funcționalitate distinctă.

Pentru context complementar:

- [Baza de date](06-database.md) — tabelele și relațiile menționate aici.
- [Backend](04-backend.md) — straturile `api / services / models / schemas`.
- [Frontend](05-frontend.md) — structura feature-based și clientul axios.

> Convenții generale: PK-urile sunt **CUID** (string), ștergerea e **soft** (`is_active = False`), iar tot textul user-facing e în **română** cu suport **RO/RU** per user (`users.language`).

---

## Taskuri săptămânale (Weekly)

**Ce face.** Grila săptămânală e ecranul „de bază": fiecare task personal apare pe ziua lui (Luni–Duminică), iar statusul se urmărește **per săptămână**. Un task recurent reapare în fiecare săptămână pe aceeași zi; un task one-time apare doar în săptămâna programată.

**Surse:**
[`frontend/src/features/tasks/pages/WeekPage.tsx`](../frontend/src/features/tasks/pages/WeekPage.tsx),
[`backend/app/services/task_service.py`](../backend/app/services/task_service.py),
[`backend/app/services/completion_service.py`](../backend/app/services/completion_service.py).

### Grila pe zile

- Pe desktop: 7 coloane (o coloană / zi). Pe mobil: carusel pe o singură zi.
- Fiecare antet de zi arată: numele zilei, data, un punct pulsatoriu cyan dacă e *azi*, un badge `făcute/total` (verde când totul e gata) și un buton „+" pentru adăugare rapidă pe ziua respectivă.
- Cardul de task arată: bandă de culoare a categoriei, titlu (tăiat dacă e `DONE`), badge de status, categorie (icon + culoare), proiect (dacă e legat), prioritate (dacă ≠ MEDIUM), timp estimat și ora de reminder.
- Pagina are două tab-uri: **Personal** (grila clasică) și **Repartizate** (vezi secțiunea [Repartizate](#repartizate-board-în-weekly)).

### Statusuri și benzi (todo / in progress / done)

Statusul trăiește în `TaskCompletion`, cu constrângerea **`UNIQUE(task_id, week_start)`** — un singur status per task per săptămână. La drag, grila afișează trei benzi:

| Bandă        | Status real            | Condiție                          |
|--------------|------------------------|-----------------------------------|
| De făcut     | `PENDING`              | fără notă                         |
| În lucru     | `PENDING`              | are notă (`note` ≠ gol)           |
| Finalizat    | `DONE`                 | —                                 |

Statusurile complete ale unui `TaskCompletion`:

| Status      | Înțeles            | Reguli                                                            |
|-------------|--------------------|-------------------------------------------------------------------|
| `PENDING`   | de făcut / în lucru | „în lucru" = `PENDING` + `note` nevidă                            |
| `DONE`      | terminat           | setează `completed_at`                                            |
| `SKIPPED`   | mutat pe altă zi   | setează `moved_to_date`; creează un task one-time pe data țintă; `skip_reason` opțional |
| `NOT_DONE`  | nefăcut            | **cere obligatoriu `skip_reason`** (motiv)                       |

Tranzițiile se fac din modalul de marcare sau prin drag între benzi și apelează endpoint-urile `completion`:
`POST /api/completions/{taskId}/done`, `/start` (notă „în lucru"), `/move` (mutare + dată nouă), `/not-done` (motiv obligatoriu).

### Recurență, categorii, reminder

- **Recurență:** taskurile cu `is_recurring = true` apar în fiecare săptămână pe `day_of_week`; cele one-time au `scheduled_date`.
- **Categorii:** au `color` + `icon` proprii și se auto-aplică pe task — culoarea se ia din categorie, nu se duplică pe task.
- **Reminder:** `reminder_time` (HH:MM) declanșează o notificare Telegram la ora fixă pe ziua curentă (vezi [Reminders](09-reminders.md)).
- **Responsabili multipli:** un task poate avea mai mulți responsabili (relația `task_assignees`).

---

## Task Azi (Today)

**Ce face.** Un singur ecran care agregă tot ce ai de făcut *astăzi*. Patru surse, fetch în paralel.

**Sursă:** [`frontend/src/features/tasks/pages/TodayPage.tsx`](../frontend/src/features/tasks/pages/TodayPage.tsx).

1. **Taskurile mele personale** pe ziua curentă — din `GET /api/tasks/week`, filtrate pe ziua de azi. Click → grila Weekly.
2. **Taskurile repartizate** — din `GET /api/tasks/assigned` (taskuri de board atribuite mie). Click → board-ul proiectului.
3. **Evenimentele de calendar** de azi — din `GET /api/calendar/events`. Click → Calendar.
4. **Board «Birou»** — componenta `OfficeBoard` integrată direct în pagină (vezi mai jos).

Dacă toate cele patru secțiuni sunt goale, se afișează un empty state.

### Board «Birou» (per-user, integrat în Azi)

**Ce face.** Biroul e un proiect-sistem special (`Project.system_key = 'OFFICE'`), partajat de toți userii (toți sunt `MEMBER`). Aici aterizează taskurile rapide venite din formularul public, după ce un admin le distribuie alegând responsabilul.

**Surse:** [`frontend/src/features/tasks/components/OfficeBoard.tsx`](../frontend/src/features/tasks/components/OfficeBoard.tsx), [`backend/app/services/office_service.py`](../backend/app/services/office_service.py).

- **Coloane** (fixe, în ordine):

  | Coloană    | `column_type` | Coloană „done" |
  |------------|---------------|----------------|
  | Backlog    | `BACKLOG`     | nu             |
  | În lucru   | `IN_PROGRESS` | nu             |
  | Finalizat  | `DONE`        | da             |
  | Verificat  | `APPROVED`    | nu             |

- **Inbox (doar admin):** taskurile încă nedistribuite apar într-o zonă cu bordură ambrei. Adminul apasă „Repartizează", alege responsabilul/responsabilii (multi-select) și taskul intră în Backlog.
- **Pe fiecare task:** comentarii și checklist (subtaskuri), accesibile dintr-un drawer de detaliu.
- **Mutare între coloane** prin drag&drop. Important: **taskurile de birou NU se arhivează niciodată** — rămân pe board chiar și după „Finalizat"/„Verificat" (spre deosebire de proiectele reale).
- Board-ul se reîmprospătează prin polling la câteva secunde (se pune pe pauză în timpul unui drag).

Endpoint principal: `GET /api/office/board` → `{ projectId, isAdmin, columns, tasks, inbox }`. Mutarea/atribuirea folosesc endpoint-urile de board ale proiectului (`/projects/{officeProjectId}/board/...`).

---

## Proiecte / Board (tip Jira)

**Ce face.** Per proiect ai o echipă cu roluri și un board Kanban în stil Jira, cu workflow de aprobare, sprinturi, story points, etichete, subtaskuri, comentarii și watchers.

**Surse:** [`frontend/src/features/projects/`](../frontend/src/features/projects/) (`pages/BoardPage.tsx`, `components/boardConstants.ts`, `AssigneePicker`, `SubtaskChecklist`, …), [`backend/app/services/board_service.py`](../backend/app/services/board_service.py), [`project_service.py`](../backend/app/services/project_service.py), [`sprint_service.py`](../backend/app/services/sprint_service.py). Detalii suplimentare în [docs/JIRA_MODULE.md](JIRA_MODULE.md).

### Coloanele board-ului

Configurația implicită (din `boardConstants.ts` + `board_service.py`):

| `column_type` | Etichetă RO | Poziție | Coloană „done" |
|---------------|-------------|---------|----------------|
| `BACKLOG`     | Backlog     | 0       | nu             |
| `PLANNED`     | Planificate | 1       | nu             |
| `IN_PROGRESS` | În lucru    | 2       | nu             |
| `DONE`        | Finalizate  | 3       | da             |
| `APPROVED`    | Aprobate    | 4       | nu             |

Există și tipul `CUSTOM` pentru coloane create de admin. Coloanele au culoare opțională și se reordonează după `position`.

### Drag & drop

Implementat cu **dnd-kit**. Mutarea apelează `move_task` doar dacă poziția chiar se schimbă (update optimist). Restricții pe rol:

- `MEMBER` poate trage doar taskurile **atribuite lui** și **nu** poate muta în `APPROVED` (aprobarea e doar pentru lead).
- `OWNER`/`ADMIN` pot muta orice task oriunde.

### Câmpurile unui card

- **Prioritate:** `LOW | MEDIUM | HIGH | URGENT` (default `MEDIUM`).
- **Story points:** întreg, **default 1**; necesar înainte de finalizare; estimare AI cu fallback pe euristici.
- **Etichete (labels):** multi-select, colorate, definite la nivel de proiect.
- **Subtaskuri (checklist):** array JSON `[{id, title, done}]` pe task, cu bară de progres `făcute/total`.
- **Comentarii:** panou în drawer, cu @mention (notificare pe Telegram); contor pe card.
- **Watchers:** abonare/dezabonare la task (iconul ochi); nu blochează mutarea.
- **Responsabili multipli:** multi-select prin `AssigneePicker`; primul din listă = responsabil primar; cardul arată până la 3 avataruri + „+N".
- **Status de aprobare:** `NULL | PENDING_REVIEW | NEEDS_FIX | APPROVED | REJECTED`.

### Workflow (plan / start / done / approve)

Butonul de acțiune al cardului tranzitează taskul prin coloane:

| Acțiune   | Din → În               | Efect                                          | Cine               |
|-----------|------------------------|------------------------------------------------|--------------------|
| `plan`    | Backlog → Planificate  | (opțional estimare, zi, oră reminder)          | responsabil / lead |
| `start`   | Planificate → În lucru | —                                              | responsabil / lead |
| `done`    | În lucru → Finalizate  | status `PENDING_REVIEW`; **story points obligatorii** | responsabil / lead |
| `approve` | Finalizate → Aprobate  | status `APPROVED`                              | **ADMIN/OWNER**    |

Acțiuni de revizuire (doar admin): `return_task` (înapoi la *În lucru*, status `NEEDS_FIX`) și `reject_task` (soft-delete, status `REJECTED`).

### Sprinturi

- Sprint: `name`, `goal`, `start_date`, `end_date`, status `PLANNED | ACTIVE | COMPLETED`, plus un `report` JSON.
- Board-ul poate fi filtrat pe sprint: toate / „backlog" (fără sprint) / un sprint anume.
- `start_sprint` (PLANNED→ACTIVE) și `complete_sprint` (generează burndown + raport per membru, mută taskurile neterminate în backlog, notifică echipa).
- Taskurile se mută între backlog și sprinturi cu avertizare de capacitate (`capacity_points` per membru).

### Roluri de echipă

Ierarhia: `VIEWER (0) < MEMBER (1) < ADMIN (2) < OWNER (3)`.

| Rol      | Vede board | Creează/editează task | Mută own | Mută orice | Aprobă | Gestionează coloane / invită | Șterge proiect |
|----------|:----------:|:---------------------:|:--------:|:----------:|:------:|:----------------------------:|:--------------:|
| VIEWER   | da (R/O)   | nu                    | nu       | nu         | nu     | nu                           | nu             |
| MEMBER   | da         | da (own)              | da       | nu         | nu     | nu                           | nu             |
| ADMIN    | da         | da                    | da       | da         | da     | da                           | nu             |
| OWNER    | da         | da                    | da       | da         | da     | da                           | da             |

> `MEMBER` vede taskurile lui **+ tot backlog-ul** (spațiu comun de planificare).

---

## Repartizate (board în Weekly)

**Ce face.** Tab-ul „Repartizate" din Weekly adună **toate taskurile mele din proiecte reale**, grupate pe zone de workflow, cu filtrare pe proiect, două moduri de sortare și o arhivă.

**Surse:** [`frontend/src/features/tasks/components/AssignedBoard.tsx`](../frontend/src/features/tasks/components/AssignedBoard.tsx), [`backend/app/services/assigned_service.py`](../backend/app/services/assigned_service.py).

- **Zonele** (în ordine, etichete RO):

  | Zonă          | Etichetă     |
  |---------------|--------------|
  | `BACKLOG`     | Backlog      |
  | `PLANNED`     | Planificare  |
  | `IN_PROGRESS` | În lucru     |
  | `DONE`        | Finalizat    |
  | `APPROVED`    | Verificat    |

  Zona se derivă din `column_type`-ul coloanei pe care stă taskul (cu fallback pe poziție pentru coloane `CUSTOM`).

- **Ce intră:** taskuri active de board (`board_column_id` setat) atribuite mie (legacy `assignee_id` **sau** modern via `task_assignees`). **Proiectul «Birou» e exclus** — are board-ul lui separat în „Azi".
- **Filtrare pe proiect:** dropdown „Toate proiectele" + proiectele distincte ale taskurilor.
- **Sortare:** „pe zonă" (coloane orizontale, una / zonă) sau „pe proiect" (secțiuni verticale, grup / proiect).
- **Arhivă:** secțiune colapsabilă, afișată când există taskuri arhivate.

**Logica de arhivă / ștergere:**

- Când un task ajunge într-o coloană de tip `APPROVED` (*Verificat*) → i se setează `archived_at` și trece în Arhivă. Dacă iese din `APPROVED`, `archived_at` se golește și revine în zonele active.
- La **finalizarea proiectului** (`POST /api/projects/{projectId}/finalize`) → taskurile cu `archived_at` setat se **șterg definitiv** (hard delete, cu cascadă pe completions/labels/activity/assignees/comments/watchers). Taskurile nearhivate rămân.

Endpoint: `GET /api/assigned/board?projectId={opțional}` → `{ zones[], projects[], archived[] }`.

---

## Quick Tasks (urgente din birou)

**Ce face.** Un canal rapid pentru cereri din birou: oricine (fără cont) trimite o cerere dintr-un formular public simplificat; adminul o vede în inbox și o distribuie către proiectul «Birou» + un responsabil.

**Surse:** [`frontend/src/features/quicktasks/`](../frontend/src/features/quicktasks/), [`backend/app/services/quick_task_service.py`](../backend/app/services/quick_task_service.py). Model: tabelul `quick_tasks`.

### Formularul public (fără auth)

Rută: **`/quick`** ([`PublicQuickTaskPage.tsx`](../frontend/src/features/quicktasks/pages/PublicQuickTaskPage.tsx)).

- **Nume și prenume** — obligatoriu (ca să știm cine a trimis).
- **Mesaj** — opțional *dacă* trimiți voce sau imagine („Scrie aici… (opțional dacă trimiți voce sau imagine)").
- **Atașamente** (max 10):
  - **Imagine** — upload `image/*`.
  - **Captură ecran** — prin `getDisplayMedia()` (ascuns dacă browserul nu suportă).
  - **Notă vocală** — `MediaRecorder` (audio/webm) + transcriere live `ro-RO` (Web Speech API) adăugată în câmpul mesaj.
  - **Paste / Ctrl+V** — imagini din clipboard.
- **Urgent** — toggle opțional (bifat ⇒ prioritate `URGENT`, altfel `NORMAL`).
- **Selector limbă RO/RU** — sus-dreapta, doar pentru traducerile UI (nu se stochează în model).

Validare: nume + (mesaj **sau** cel puțin un atașament). La trimitere fără titlu, se generează un fallback („Notă vocală" / „Imagine" / „Cerere rapidă"). Endpoint: `POST /api/quick-tasks/public`.

### Inbox admin + distribuire

Rută: **`/quick-tasks`** ([`QuickTasksPage.tsx`](../frontend/src/features/quicktasks/pages/QuickTasksPage.tsx)), vizibilă efectiv adminilor.

- Lista de cereri `NEW`: nume + dată, badge de prioritate (URGENT roșu / NORMAL ambrei / LATER slate), descriere (`whitespace-pre-wrap`), atașamente (imagini cu lightbox, audio cu player).
- Adminul alege **proiectul** și **responsabilul**, apoi „Atribuie": se creează un `Task` real în Backlog (`origin = "QUICK"`, `story_points = 1`), cererea devine `ASSIGNED` și responsabilul primește o notificare (link spre `/?tab=assigned`). Dacă nu se alege proiect, se folosește automat **«Birou»** (auto-creat, responsabilul adăugat ca `MEMBER`).
- „Respinge" → status `DISMISSED` + soft-delete.

Stările unei cereri: `NEW → ASSIGNED` sau `NEW → DISMISSED`.

### Badge roșu în sidebar

Numărul cererilor noi apare ca **badge roșu** lângă „Task-uri rapide" în sidebar ([`useQuickTaskCount`](../frontend/src/features/quicktasks/hooks/useQuickTaskCount.ts) → `GET /api/quick-tasks/count`). Contorul numără doar `status = "NEW"` și **returnează 0 pentru non-admini**. Polling la ~45s + refetch pe focus/vizibilitate; afișează „99+" peste 99. În plus, un job programat (`notify_admins_new_quick_tasks`) notifică adminii la apariția de cereri noi (anti-duplicare prin `notified_at`).

---

## Calendar (Outlook-like)

**Ce face.** Calendar în stil Outlook cu view-uri Zi / Săptămână / Lună, tipuri de evenimente, recurență, multi-reminder, participanți și categorii cu auto-color.

**Surse:** [`frontend/src/features/calendar/`](../frontend/src/features/calendar/) (`DayView`, `WeekView`, `MonthView`, `EventModal`), [`backend/app/services/calendar_service.py`](../backend/app/services/calendar_service.py).

- **View-uri:** Zi (timeline 24h, snap la 15 min), Săptămână (Luni–Duminică), Lună (max 3 evenimente / celulă, „+N" altfel). Preferința e salvată în `localStorage.calendarView`.
- **Tipuri de eveniment:** `meeting_online` (💻), `meeting_in_person` (🏢), `appointment` (📌), `reminder` (🔔), `personal` (🌳), `task` (✓). Online cere URL, in-person/appointment cer locație.
- **Recurență:** `NONE | DAILY | WEEKLY | MONTHLY | YEARLY`, cu `recurrence_until` opțional. **Expandată la query, nu la insert** — DB stochează un singur master cu regula, iar ocurențele se calculează în Python la citire (cu ID-uri virtuale `"{masterId}::{data}"`, plafon de siguranță pe iterații, tratare edge-case Feb 29).
- **Remindere:** presetări la **0 / 5 / 10 / 15 / 30 / 60 / 120 / 1440** minute înainte (vezi [Reminders](09-reminders.md)). Mai multe per eveniment.
- **Participanți:** useri reali (`CalendarEventAttendee`, status `INVITED/ACCEPTED/DECLINED`, notificare la invitație) + invitați externi (nume + email opțional). Invitatul vede modal read-only cu Accept/Decline.
- **Categorii:** 5 default auto-create (Muncă, Personal, Familie, Sănătate, Important) cu culoare/icon; toggle vizibilitate; auto-color pe eveniment.
- **Integrare taskuri:** taskurile de board cu dată apar ca evenimente read-only gri, click → board.
- **Prezență (evenimente trecute):** `PENDING / ATTENDED / AUTO_ATTENDED / MISSED`, cu auto-marcare după ce trece evenimentul + notă.

---

## Notebook (carnet)

**Ce face.** Carnet personal cu topicuri și notițe, plus management de timp și schițe.

**Surse:** [`frontend/src/features/notebook/`](../frontend/src/features/notebook/) (`NotebookPage`, `SketchPad`), [`backend/app/services/notebook_service.py`](../backend/app/services/notebook_service.py). Modele: `NotebookTopic`, `NotebookNote` (+ schițe).

- **Idei (topicuri + note):** topicuri tip card (emoji + nume + descriere + contor). Patru topicuri predefinite (Proiecte, Business, Învățare, Personal) care **nu se pot șterge**; cele custom da. În detaliul unui topic scrii liber, fiecare salvare devine o notă (`note_type = 'idea'`).
- **Management timp:** *Pași* (secvențiali, `step_order`) și *Taskuri* cu status `todo / in_progress / done` (badge + tăiere text la `done`).
- **Schițe:** galerie de desene pe canvas (touch/stylus/mouse), salvate ca imagine base64.

Ștergerea unui topic e soft (`is_deleted`) și **orfanizează** notele (`topic_id = NULL`), nu le șterge. Accesibil și din bot (`/notes`).

---

## Statistici / Rapoarte

**Ce face.** Sumarul progresului săptămânal și istoricul, pe baza `TaskCompletion`.

**Surse:** [`frontend/src/features/stats/pages/StatsPage.tsx`](../frontend/src/features/stats/pages/StatsPage.tsx), [`backend/app/services/stats_service.py`](../backend/app/services/stats_service.py).

- **Progresul săptămânii curente** — gauge circular cu procent + metrici: Total / Completate / Mutate / Nefăcute.
- **Ultimele 8 săptămâni** — bar chart cu procentul de completare per săptămână.
- **Distribuția pe statusuri** — pie chart (Done / Skipped / Not Done / Pending).
- **Top 5 streak-uri** — taskuri cu cele mai multe săptămâni consecutive `DONE`.
- **Top 5 ratate** — taskuri cu cele mai multe `NOT_DONE`.

Endpoint-uri: `GET /api/stats/weekly`, `/history?weeks=8`, `/streaks`, `/missed` (cu parametru `user` pentru admini). Pe Telegram: `/stats`.

---

## Profil & notificări

**Ce face.** Setări personale: profil, temă, notificări/remindere, securitate (PIN) și legarea contului de Telegram.

**Surse:** [`frontend/src/features/profile/pages/ProfilePage.tsx`](../frontend/src/features/profile/pages/ProfilePage.tsx), [`frontend/src/features/notifications/`](../frontend/src/features/notifications/), [`backend/app/models/user.py`](../backend/app/models/user.py).

- **Profil:** nume + email, „Salvează profil".
- **Temă:** „Întunecat" (default) / „Luminos". Salvată **dual** — `localStorage` (feedback instant) + `users.theme` (sync între device-uri). Folosește variabile CSS + clase semantice (`bg-surface`, `text-fg`, …).
- **Notificări** (`users.notification_settings` JSON):
  - Toggle remindere pe Telegram, toggle notificări în browser.
  - **Web Push** (`PushToggle`) — cere permisiune, Service Worker + PushManager, depinde de cheile VAPID pe server.
  - **Fereastră „Nu deranja"** — `de la / până la` (HH:MM).
  - Minute reminder implicite (select: 0/5/15/30/60/1440).
- **Securitate — PIN:** 4–8 cifre (`pin_hash`), folosit la refresh-ul tokenului după expirarea JWT.
- **Telegram linking:** dacă e nelegat, „Generează cod /link" → cod cu expirare; userul trimite botului `/link <cod>`. Dacă e legat, „Dezleagă". (Vezi [Auth](07-auth.md) și [Telegram bot](08-telegram-bot.md).)
- **Clopoțel notificări** (`NotificationBell`) — badge cu necitite (poll la ~30s), dropdown cu lista, marcare ca citit + navigare la `link`.
- **Admin:** parolă de admin (pentru login direct la `/admin_task_manager`) + linkuri spre Cereri / Utilizatori / Panou / Statistici.
