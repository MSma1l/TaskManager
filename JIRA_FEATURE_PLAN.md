# Plan: Secțiune colaborativă tip Jira (Proiecte + Echipă + Board Kanban)

> Status: **planificat**, în curs de implementare pe faze.
> Scope acum: **Fazele 1–3**. GitHub (webhooks) și Calendar partajat = **mai târziu / neatinse**.
> Cerință transversală: **teste unitare cu ≥80% coverage** + verificare „fără erori, totul funcționează".

## Context

Aplicația are deja `Project` și `Task`, dar totul e izolat pe `user_id` (un user = datele lui).
Utilizatorul vrea o experiență tip **Jira**: invită oameni în proiectele pe care le creează, board
Kanban cu etape (coloane) proprii, drag&drop, assignee, comentarii și colaborare în timp „aproape real"
(polling ~5s). **Modul personal rămâne neschimbat**: taskurile săptămânale (view-ul `/`) funcționează exact ca acum.

Decizii confirmate cu utilizatorul:
- **Membri per-proiect** (fără nivel separat de Workspace/Organizație).
- **GitHub** → mai târziu (scos din scope acum).
- **Online** → **polling periodic ~5s** (fără WebSocket).

## Decizie de arhitectură cheie: extindem tabelul `Task` (nu tabel separat)

Un „task de board" = un `Task` cu `board_column_id` setat. Un „task săptămânal" = `Task` cu `day_of_week`
setat și `board_column_id` NULL. Motiv: reuse maxim (comentarii/activity/watchers/assignee/labels merg pe
aceeași entitate), iar view-ul săptămânal rămâne identic filtrând `board_column_id IS NULL`.

Consecințe: `tasks.day_of_week` și `tasks.category_id` devin **nullable**; `task_to_dict()` și `TaskOut`
trebuie să trateze `category` null (altfel 500 pe board) — **primul lucru de reparat**.

---

## Modele noi (`backend/app/models/`)

- **Enum `ProjectRole`** în `models/base.py`: `OWNER / ADMIN / MEMBER / VIEWER` (stocat ca String, ca `User.role`).
- **`ProjectMember`** — `project_id`, `user_id`, `role`, `invited_by`, `created_at`; `UNIQUE(project_id, user_id)`.
- **`BoardColumn`** — `project_id`, `name`, `position`, `color?`, `is_done_column` (aici trăiește starea „done"), `created_at`.
- **`Label`** + **`TaskLabel`** (asociere many-to-many task↔label, per proiect).
- **`TaskComment`** — `task_id`, `user_id`, `body`, timestamps.
- **`TaskActivity`** — `task_id`, `project_id`, `user_id` (actor), `action` (CREATED/MOVED/ASSIGNED/COMMENTED/...), `meta` JSON, `created_at`.
- **`TaskWatcher`** — `task_id`, `user_id` (PK compus).
- **`Task` modificat**: `category_id` nullable, `day_of_week` nullable, **+** `board_column_id?`, `board_order?`, `assignee_id?` (+ relationships labels/comments/watchers).

## Migrare Alembic `015_collaborative_projects.py` (`down_revision="014"`)

1. `alter_column` pe `tasks.day_of_week` și `tasks.category_id` → `nullable=True`.
2. Creează tabelele noi (idempotent cu `_has_table`), creează coloanele noi pe `tasks` (idempotent cu `_has_column`) + indexuri pe FK-uri.
3. `UNIQUE(project_id, user_id)` pe `project_members`.
4. **Backfill**: pentru fiecare proiect existent cu `user_id`, inserează `ProjectMember(role=OWNER)` (în Python, cu `generate_cuid`).
5. **Seed coloane implicite** per proiect existent (RO): `De facut`, `In lucru`, `Finalizat` (ultima `is_done_column=True`).
6. `downgrade()`: drop tabele + coloane, restaurează NOT NULL (documentat: eșuează dacă există taskuri de board).

## Refactor access-control (`backend/app/services/membership_service.py`)

- `ROLE_RANK = {VIEWER:0, MEMBER:1, ADMIN:2, OWNER:3}`.
- `get_member(db, project_id, user_id)`, `get_accessible_project_ids(db, user_id)`, `require_membership(db, project_id, user_id, min_role)`.
- **`project_service.py`**: scoping din `Project.user_id == me` → `Project.id.in_(accessible_ids)`. `create_project` inserează și `ProjectMember(OWNER)` + cele 3 coloane default în aceeași tranzacție. Roluri: citire→VIEWER, update→ADMIN, delete→OWNER.
- **`task_service.py`**: funcțiile săptămânale (`get_all_tasks`, `get_tasks_for_week`, ...) primesc filtru suplimentar `Task.board_column_id.is_(None)` → view-ul personal rămâne identic. Mutațiile de board **NU** trec prin `/api/tasks` (acela e scoped pe `user_id` → ar da 404 pentru alți membri), ci prin `board_service.py` cu `require_membership`.

## Endpointuri noi (sub-routere în `app/api/router.py`)

- `app/api/members.py` — `/api/projects/{id}/members`: list (VIEWER), invite by username/email (ADMIN), update role (OWNER), remove (ADMIN). Protecție „ultimul OWNER".
- `app/api/board.py` — `/api/projects/{id}/board`: GET board complet (coloane+taskuri, pentru polling); columns CRUD (ADMIN); create board task (MEMBER); **`POST /tasks/{tid}/move`** (drag&drop persist); assign (MEMBER, + watcher + notificare Telegram); labels.
- `app/api/comments.py` — `/api/tasks/{tid}/comments`: list/create/edit/delete; parse `@username` → notificare Telegram către membrii menționați + watchers (via `asyncio.create_task`, respectând DND), activity COMMENTED.
- `app/api/activity.py` — feed la nivel de proiect și de task.
- Watchers: `POST/DELETE /api/tasks/{tid}/watch`.

## Schemas & serializers (`backend/app/schemas/`)

- Noi: `board.py`, `member.py`, `comment.py` (camelCase, ca restul).
- Fix critic: `task_to_dict` guard pe `category` null; `TaskOut.category/categoryId/dayOfWeek` → Optional; adaugă `assigneeId`, `boardColumnId`, `boardOrder`, `labels`, `commentCount`, `watcherCount`.

## Frontend (`frontend/src/features/projects/`)

- **Dependență nouă**: `@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` — instalat în container (`docker compose exec frontend npm install ...`) + commit la `package.json`/`package-lock.json`.
- **api**: `members.ts`, `board.ts`, `comments.ts`, `activity.ts`, `watchers.ts`.
- **hooks**: `useBoard` (polling 5s, model după `shared/hooks/useNotifications.ts`; optimistic move; nu aplica poll-ul în timpul unui drag), `useComments`, `useMembers`, `useActivity`.
- **pages**: `BoardPage.tsx` (DndContext + SortableContext). Tab „Board | Listă" în `ProjectDetailPage` ca să nu spargem ruta existentă.
- **components**: `InviteMemberModal`, `ColumnModal`, `BoardColumn`, `BoardCard`, `TaskDetailDrawer` (comentarii + @mention autocomplete + activity + watch), `MembersBar`, `AssigneePicker`, `LabelPicker`. Folosesc **token-uri semantice** (`bg-surface`, `text-fg`, `border-border`).
- **routes**: `<Route path="projects/:projectId/board" element={<BoardPage/>} />`.
- **types**: extinde `Task` (`assigneeId?`, `boardColumnId?`, `boardOrder?`, `category` nullable); interfețe noi.
- **i18n**: namespace `board:` în `shared/i18n/dictionary.ts` (RO default + RU complet).

## Teste & coverage (cerință: ≥80% pe codul NOU Jira)

> Decis cu utilizatorul: **pytest + Vitest**, coverage **doar pe codul nou Jira** (nu tot codebase-ul), verificare **după fiecare fază**.
- **Backend**: `pytest` + `pytest-cov` + `TestClient`, DB de test (SQLite în memorie / Postgres efemer). Acoperă modulele noi: `membership_service`, scoping proiecte/taskuri, `board_service` (move/reorder), comments + parse @mention, izolarea view-ului săptămânal. Prag `--cov-fail-under=80` pe pachetele noi.
- **Frontend**: `vitest` + `@testing-library/react`. Acoperă: `useBoard` (polling/optimistic), logica de drag, componente noi cheie. Prag 80% pe modulele noi.
- **Sub-agent de verificare** rulat **după fiecare fază**: rulează suita, raportează coverage pe codul nou, confirmă build + typecheck fără erori.

## Verificare end-to-end

```bash
docker compose exec backend alembic upgrade head && docker compose exec backend alembic current   # 015
docker compose exec postgres psql -U taskuser -d taskmanager -c "SELECT count(*) FROM project_members WHERE role='OWNER';"
docker compose exec frontend npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
docker compose exec frontend npx tsc --noEmit && docker compose exec frontend npm run build
```
Manual: creează proiect (3 coloane + OWNER) → invită user B (MEMBER) → adaugă coloană → drag card (persistă) →
view săptămânal neschimbat → assign la B (Telegram) → comentariu `@B` (Telegram mention) → B vede update în ~5s (polling).

## Ordine de implementare (ca să nu se spargă nimic)

1. Fix serializer/schema `category` null (altfel 500 pe board). **Primul.**
2. Migrare 015 (nullable + tabele + backfill + seed coloane). Verifică backfill.
3. `membership_service` + refactor `project_service`.
4. Filtru `board_column_id IS NULL` în task_service (regresie view săptămânal).
5. `board_service` + endpointuri board/members.
6. Comentarii/activity/watchers + @mention → Telegram.
7. Frontend: dnd-kit → api/hooks → BoardPage → drawer/comentarii → members → polling → i18n.
8. **Teste (≥80%) + verificare finală prin sub-agent.**

## Riscuri

- `task_to_dict` cu `category` null → 500 (de reparat primul).
- Mutațiile de board prin `/api/tasks` (scoped pe user_id) → 404 pentru alți membri (folosește endpointurile board).
- `node_modules` e volum anonim în docker → instalează dnd-kit în container, nu pe host.
- Poll de 5s peste un drag în curs → jank (nu aplica poll-ul în timpul drag-ului; diff înainte de setState).
- Notificările Telegram trebuie `asyncio.create_task` + respectă DND, doar membri cu `telegram_chat_id`.
- Protecție „ultimul OWNER" la schimbare rol / remove.
