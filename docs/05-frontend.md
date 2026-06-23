# Frontend (React + TypeScript + Vite, PWA)

Frontendul este aplicația web a Task Manager-ului: o SPA React scrisă în TypeScript, build-uită cu Vite și stilizată cu Tailwind. Servește două suprafețe distincte — aplicația pentru utilizatori normali la `/` și panoul de admin la `/admin_task_manager` — plus câteva pagini publice (fără login). Toate apelurile lovesc API-ul FastAPI prin proxy-ul nginx (`/api/*`).

Pentru context arhitectural general vezi [Arhitectura](03-architecture.md), pentru fluxul de autentificare [Auth](07-auth.md), iar pentru lista de funcționalități [Funcționalități](10-features.md).

## Stack

| Tehnologie | Rol |
| --- | --- |
| **React 18 + TypeScript** | UI declarativ, tipare statice |
| **Vite 5** | dev server cu HMR + build production |
| **Tailwind CSS 3** | stilizare prin clase utilitare + variabile CSS (temă) |
| **axios** | client HTTP cu interceptor pentru token (`shared/api/client.ts`) |
| **react-router-dom 6** | routing, rute protejate, code-splitting via `lazy()` |
| **@dnd-kit** (`core`, `sortable`, `utilities`) | drag & drop pe boardurile Kanban |
| **recharts** | grafice pe paginile de statistici |
| **jspdf** | export PDF (rapoarte) |
| **qrcode** | generare QR la login |
| **vitest** + Testing Library | teste unitare (acolo unde există) |

Aplicația este **PWA** — instalabilă, cu suport pentru safe-area pe iOS (vezi `env(safe-area-inset-*)` în layout).

## Structura (feature-based)

```
frontend/src/
├── app/
│   ├── App.tsx              # I18nProvider + BrowserRouter + LanguagePickerModal
│   └── routes.tsx           # ProtectedRoute / AdminRoute + toate rutele (lazy)
│
├── features/                # fiecare feature izolat: api / components / hooks / pages
│   ├── auth/                # login, verify, QR, PIN, request-access, telegram app
│   ├── tasks/               # Weekly (board «Repartizate») + Today (board «Birou»)
│   ├── calendar/            # calendar Outlook-like (utils pentru recurențe)
│   ├── projects/            # FEATURE DE REFERINȚĂ — board Kanban, sprinturi, membri
│   ├── qa/                  # Q&A pe proiecte
│   ├── notebook/            # caiet de notițe (topics + notes)
│   ├── stats/               # dashboard statistici (recharts)
│   ├── reports/             # rapoarte / export
│   ├── viewaccount/         # raport public read-only (/view/:token)
│   ├── quicktasks/          # Quick Tasks + formular public (/quick)
│   ├── verify/              # verificare taskuri primite
│   ├── friends/             # prieteni / conexiuni
│   ├── notifications/       # NotificationBell + feed notificări
│   ├── profile/             # profil utilizator + setări
│   └── admin/               # panoul de admin (layout, dashboard, users, stats, requests)
│
└── shared/
    ├── api/client.ts        # instanța axios + interceptoare (token, 401)
    ├── components/
    │   ├── layout/          # AppLayout, Sidebar (desktop), BottomNav (mobil)
    │   ├── search/          # CommandPalette
    │   ├── quickadd/        # QuickAddFab
    │   ├── tour/            # ghid interactiv
    │   └── ui/              # primitive reutilizabile
    ├── hooks/               # useTheme, useNotifications, useLocalDraft
    ├── i18n/                # dictionary.ts (RO/RU), I18nProvider, LanguagePicker
    └── utils/               # dates, constants
```

Fiecare feature respectă același tipar: `api/` (apeluri axios), `components/` (UI), `hooks/` (state + fetch, ex. `useBoard`, `useProjects`), `pages/` (puncte de intrare montate de router).

## Routing

`app/routes.tsx` definește toate rutele. `App.tsx` montează doar `I18nProvider` → `BrowserRouter` → `AppRoutes`. Paginile auth sunt încărcate eager (sunt mici și pe calea critică de login); restul sunt **code-split** prin `lazy()` + `<Suspense>`, astfel încât dependențele grele (recharts, jspdf, qrcode) ajung în chunkuri separate.

Două gărzi de rută:

```tsx
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }) {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated) return <Navigate to="/admin_task_manager" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;  // user normal pe admin → /
  return <>{children}</>;
}
```

### Rute principale

| Rută | Pagină | Acces |
| --- | --- | --- |
| `/login` | LoginPage | public |
| `/request-access` | RequestAccessPage | public |
| `/qr-confirm/:id` | QRConfirmPage | public |
| `/tg-app` | TelegramAppPage | public (Telegram WebApp) |
| `/quick` | PublicQuickTaskPage | **public — fără login** |
| `/view/:token` | PublicReportPage | **public — raport read-only** |
| `/` | WeekPage (Weekly) | user |
| `/today` | TodayPage | user |
| `/projects` | ProjectsPage | user |
| `/projects/:projectId` | ProjectDetailPage (`/board`, `/qa`) | user |
| `/quick-tasks` | QuickTasksPage | user |
| `/verify` | VerifyPage | user |
| `/calendar` | CalendarPage | user |
| `/notebook` | NotebookPage | user |
| `/stats` | StatsPage | user |
| `/reports` | ReportsPage | user |
| `/profile` | ProfilePage | user |
| `/admin_task_manager` | AdminLoginPage | public (login admin) |
| `/admin_task_manager/{dashboard,users,requests,stats}` | AdminLayout + pagini | **admin** |

Rutele user sunt copii ale lui `AppLayout` (Sidebar + BottomNav + bell). Rutele admin sunt copii ale lui `AdminLayout`. Orice altceva (`*`) redirecționează la `/`.

## Clientul axios (`shared/api/client.ts`)

Toate feature-urile importă această instanță unică — **nu re-implementa atașarea tokenului în feature**.

Interceptorul de **request** atașează automat header-ul de autorizare din `localStorage`:

```ts
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

Interceptorul de **response** tratează `401`:

- ignoră apelurile din timpul login-ului (`/auth/login`, `/auth/verify`, `/auth/refresh`) ca să nu redirecționeze în mijlocul „dansului” de autentificare;
- altfel șterge tokenul, emite evenimentul `auth:expired` (ascultat de `useAuth`, care arată un modal de „sesiune expirată”) și redirecționează la `/admin_task_manager` dacă rolul salvat era `ADMIN`, altfel la `/login`. Căile admin „adânci” (ex. `/admin_task_manager/dashboard`) sunt pagini reale, deci sunt redirecționate; doar `/login` și `/admin_task_manager` sunt tratate ca pagini de login.

**Verificare proactivă de expirare**: `useAuth` salvează `tokenExpiresAt` în `localStorage` și, dacă timestampul e în trecut, emite singur `auth:expired` (fără să mai aștepte un 401 de la server).

## i18n (RO / RU)

Limba este per-utilizator și gestionată de `shared/i18n/`. `I18nProvider` detectează limba inițială din `localStorage` (`app:lang`), apoi din locale-ul browserului (RU dacă începe cu `ru`, altfel RO implicit), o reflectă pe `<html lang>` și o sincronizează cross-tab. La alegere explicită o persistă și pe profil (`authApi.updateMe({ language })`), astfel încât alegerea urmează contul între device-uri și botul Telegram.

Componentele consumă traducerile prin hook-ul `useT()`:

```tsx
const t = useT();
return <span>{t('nav.weekly')}</span>;
```

**Cum adaugi un string nou** (`shared/i18n/dictionary.ts`):

1. Adaugă cheia în **ambele** blocuri, `ro` și `ru`, sub namespace-ul feature-ului (ex. `board.unassigned`).
2. Referă-o cu `t('board.unassigned')`.

Cheile lipsă cad înapoi pe RO, iar dacă lipsesc și acolo afișează însăși calea cheii — așa că stringurile netraduse sunt vizibile în dev. Niciodată nu hardcoda text user-facing; mereu prin dicționar.

## Temă light / dark

Tema folosește **variabile CSS** comutate prin atributul `data-theme` pe `<html>` plus **clase Tailwind semantice** — nu hardcoda `bg-white` / `bg-gray-900`. Folosește:

- `bg-bg`, `bg-surface`, `bg-elevated` — fundaluri
- `text-fg`, `text-muted` — text
- `border-border` — borduri

Persistare **dublă** (vezi `shared/hooks/useTheme.ts`):

- `localStorage['theme']` — feedback instant la boot (`bootstrapTheme()` rulează înainte de React);
- `users.theme` pe server — sync între device-uri, printr-un `PUT /auth/me` best-effort.

## Layout

`AppLayout` (montat pe toate rutele user) compune suprafața:

- **Sidebar** (`hidden md:flex`, doar desktop) — navigare grupată pe secțiuni:
  - **Activitate**: Weekly (`/`), Task (`/today`)
  - **Proiecte**: Proiecte (`/projects`), Quick Tasks (`/quick-tasks`), Verificare (`/verify`)
  - **Planificare**: Calendar (`/calendar`), Caiet (`/notebook`)
  - **Analiză**: Dashboard (`/stats`), Rapoarte (`/reports`)
  - **Cont**: Profil (`/profile`)

  Iconul Quick Tasks afișează un **badge roșu** cu numărul de taskuri noi (`useQuickTaskCount`).

- **BottomNav** (`md:hidden`, doar mobil) — bară de jos cu un subset de iteme: Weekly, Task, Proiecte, Caiet, Calendar, Statistici, Profil. Respectă `safe-area-inset-bottom` (iPhone home indicator).

- **NotificationBell** — clopoțelul de notificări fix top-right.

- Plus utilitare globale: `CommandPalette` (căutare/comenzi), `QuickAddFab` (adăugare rapidă), `Tour` (ghid interactiv) și `ForcedSetupModal` (forțează PIN + nume complet la prima logare).

## Convenția pentru un feature nou

Când adaugi un feature, **copiază structura din `features/projects/`** (referința): `api/` (axios), `components/`, `hooks/` (`useX` cu state + fetch), `pages/`. Nu pune componente cross-feature direct în `shared/components/` — acolo intră doar layout-ul și primitivele cu adevărat reutilizabile (`ui/`). Importurile dintre feature-uri se fac explicit (ex. layout-ul importă `useQuickTaskCount` din `features/quicktasks`).

## Feature-uri recente notabile

- **Board «Birou»** (`features/tasks/components/OfficeBoard.tsx`) în pagina **Today** — vizualizare de tip board pentru taskurile zilei.
- **Board «Repartizate»** (`AssignedBoard.tsx` / `AssignedTasksList.tsx`) în pagina **Weekly** — taskurile atribuite din proiecte, cu drawer de detaliu.
- **AssigneePicker** (`features/projects/components/AssigneePicker.tsx`) — selector **multi-select** de responsabili (atribuiri multiple), cu opțiunea „neatribuit”.
- **Formular public Quick Task simplificat** (`features/quicktasks/pages/PublicQuickTaskPage.tsx`, rută `/quick`) — accesibil **fără login**, cu captură de ecran / upload / paste (`ScreenshotInput.tsx`), mesaj vocal (`VoiceRecorder.tsx`) și selector de limbă RO/RU.
