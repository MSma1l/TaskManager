# Weekly Task Manager

Aplicatie personala de management taskuri saptamanale cu Web App (PWA) + Telegram Bot.
Suporta useri multipli cu admin separat, autentificare 2FA prin Telegram, calendar tip Outlook si tema light/dark.

## Stack

- **Backend:** Python + FastAPI + SQLAlchemy + Alembic + APScheduler
- **Frontend:** React + TypeScript + Vite + Tailwind CSS (cu CSS variables pentru teme)
- **Database:** PostgreSQL
- **Bot:** python-telegram-bot
- **Containerizare:** Docker + docker-compose + Nginx

## Pornire rapida

1. Copiaza fisierul de configurare:
```bash
cp .env.example .env
```

2. Completeaza `.env`:
   - `TELEGRAM_BOT_TOKEN` - de la @BotFather pe Telegram
   - `TELEGRAM_CHAT_ID` - chat ID-ul folosit pentru a seeda admin-ul initial
   - `APP_PIN` - PIN-ul initial al admin-ului (folosit la refresh dupa 12h)
   - `JWT_SECRET` - un string random lung
   - `ADMIN_USERNAME` - username-ul admin-ului seedat (default `admin`)
   - `JWT_EXPIRE_HOURS` - durata sesiunii in ore (default 12)

3. Porneste aplicatia:
```bash
docker compose up --build
```

4. Acceseaza:
   - **Web App utilizator:** http://localhost
   - **Pagina admin:** http://localhost/admin_task_manager (login separat, rol ADMIN)
   - **API:** http://localhost:3001
   - Pe iPhone/iPad: Safari > Share > "Add to Home Screen" (PWA)

---

# Faze de dezvoltare

## ✅ Faza 1 — Multi-user, admin separat, autentificare 2FA prin Telegram

**Logare in 2 pasi**:
1. Userul tasteaza username-ul → server genereaza cod de 6 cifre, il trimite pe Telegram
2. Userul tasteaza codul → primeste un JWT valabil 12 ore

**Token & refresh**:
- JWT-ul expira la 12 ore (configurabil cu `JWT_EXPIRE_HOURS`)
- La expirare, userul alege intre: re-logare cu cod Telegram nou **sau** PIN-ul personal setat din profil
- Logout → token-ul e invalidat local; userul poate switch-ui de cont

**Admin separat**:
- URL dedicat: `/admin_task_manager` (login propriu, doar useri cu `role = ADMIN`)
- Dashboard cu sumar: useri activi, admini, useri legati la Telegram
- CRUD complet pe useri: creare, editare rol, dezactivare, generare cod /link

**Telegram /link**:
- Userii noi nu au chat-ul Telegram setat; admin genereaza un cod (6 cifre, 30 min)
- Userul trimite `/link <cod>` botului → chat-ul se leaga la cont automat

**Stack**:
- Backend: model `User` cu `role`, `telegram_chat_id`, `pin_hash`; modele `LoginCode`, endpoint-uri `/auth/login`, `/auth/admin/login`, `/auth/verify`, `/auth/refresh`, `/auth/me`
- Frontend: `LoginPage` cu 3 stari (username/code/pin), `AdminLoginPage`, `AdminLayout`, `AdminUsersPage`, route guards `ProtectedRoute` + `AdminRoute`

## ✅ Faza 2 — Calendar tip Outlook + tema light/dark

**Calendar**:
- 3 view-uri: **Zi**, **Saptamana**, **Luna** (toggle in toolbar)
- Sidebar cu "calendare" (categorii) — bifezi sa filtrezi
- Linie rosie "acum" peste grila de ore, banner all-day, click pe ora → eveniment nou cu timpul pre-completat

**Tipuri de evenimente** (cu campuri conditionale):
- **Sedinta online** (cu link Zoom/Meet/Teams)
- **Sedinta in persoana** (cu locatie)
- **Programare**, **Reminder**, **Personal**, **Task**

**Functionalitati per eveniment**:
- Recurenta: zilnic / saptamanal / lunar / anual + data limita (extins automat in vizualizare)
- Multi-reminder: 0 / 5 / 10 / 15 / 30 / 60 / 120 / 1440 min inainte (notificare pe Telegram)
- Lista de participanti (nume + email)
- Categorie (cu auto-color), all-day, status (confirmat/tentativ/anulat)
- Modal cu tab-uri: General / Reminderuri / Participanti

**Notificari automate**:
- Scheduler in fiecare minut verifica daca un eveniment are reminder care cade pe minutul curent
- Trimite pe Telegram-ul userului mesaj cu titlu + ora + locatie/link
- Anti-duplicare prin `calendar_reminder_logs`

**Tema light / dark**:
- Comutare din **Profil → Aspect** (preview-uri pentru fiecare tema)
- Variabile CSS + culori semantice in Tailwind (`bg-surface`, `text-fg`, `border-border`, etc.)
- Tema persistata in localStorage si pe server (`users.theme`)

## ✅ Faza 3 — Profil + setari notificari avansate

- Pagina `/profile` cu sectiunile: **Profil** (nume/email), **Aspect** (tema), **Notificari**, **Securitate** (PIN)
- Butoane "Genereaza cod /link" si "Foloseste cod legare" — userul isi poate lega singur Telegram-ul
- Setari de notificari respectate de scheduler:
  - Toggle Telegram on/off
  - Toggle web push on/off
  - "Nu deranja" — interval orar in care reminderurile sunt suprimate
  - Reminder default pentru evenimente noi (preselectat in modal)
- Web push pentru evenimente de calendar (similar polling-ului existent pentru taskuri)

## 🔜 Faza 4 — Tablet & stylus (PWA)

- Carnet (notebook) cu **canvas** pentru scris cu degetul / stylus
- Filtru `pointerType=pen` cu palm rejection
- Touch targets >= 44px pe ecrane mobile/tableta
- Gesturi swipe pentru navigare saptamana / luna in calendar
- Atasarea desenelor la evenimente sau la pagini de carnet

## 🔜 Faza 5 — Ghid interactiv prin aplicatie

- Pop-over-uri ("frame-uri") care apar pas cu pas la prima utilizare
- Explica fiecare zona: cum adaugi proiect, cum legi un task de un proiect, cum creezi eveniment recurent, cum legi Telegram, cum schimbi tema
- Buton "Reia ghidul" in profil
- Persistat in `localStorage` per tutorial-id

## 🔜 Faza 6 — Testare baguri & lustruire

- Pass complet pe toate fluxurile (login → admin → useri → calendar → taskuri → notebook → profil)
- Fix erori de TypeScript / runtime descoperite
- Validari pe toate input-urile (email, URL, ore)
- Mesaje de eroare prietenoase, loading states, empty states
- Verificat pe mobile, tableta, desktop

---

## Proiecte (pastrat din versiunea initiala)

- Pagina **Proiecte** in app — creezi proiect cu nume, descriere, culoare, deadline
- Cand adaugi un task, il poti asocia unui proiect → in lista saptamanala apare un badge cu proiectul
- Click pe proiect din `/projects` → vezi toate task-urile lui + progres
- Util cand grupezi taskuri pe initiative mari (deploy, monitoring, etc.)

## Logare — flow vizual

```
[Login] → username → cod 2FA pe Telegram → [App] (12h)
   │
   └─→ Token expirat? → [PIN] sau [cod nou Telegram] → reinnoit (12h)

[Admin]
   /admin_task_manager → username admin → cod 2FA → /admin_task_manager/dashboard
```

## Cum obtii Telegram Token si Chat ID

### Token:
1. Deschide Telegram, cauta @BotFather
2. Trimite `/newbot`, urmeaza pasii
3. Copiaza TOKEN-ul primit in `.env` → `TELEGRAM_BOT_TOKEN`

### Chat ID:
1. Scrie `/start` botului tau nou creat
2. Acceseaza in browser: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Gaseste in raspuns: `"chat":{"id": XXXXXXXXX}`
4. Copiaza acel numar in `.env` → `TELEGRAM_CHAT_ID`

## Comenzi Telegram

| Comanda | Descriere |
|---------|-----------|
| `/today` | Taskurile de azi |
| `/week` | Taskurile saptamanii |
| `/tasks` | Alege ziua si vezi taskurile |
| `/add` | Adauga task nou (ghidat) |
| `/done` | Marcheaza task ca facut |
| `/skip` | Muta task pe alta zi |
| `/notdone` | Marcheaza ca nefacut (motiv obligatoriu) |
| `/delete` | Sterge un task |
| `/stats` | Statistici saptamana curenta |
| `/notes` | Carnetul meu |
| `/link <cod>` | Leaga acest chat la un cont (cod de la admin) |
| `/help` | Lista tuturor comenzilor |

### Adaugare rapida din chat:
Scrie direct in chat: `task numele taskului`
Exemplu: `task verifica backup servere`
Botul te va ghida sa alegi data si categoria.

## Comenzi Docker utile

```bash
# Pornire
docker compose up --build

# Pornire in background
docker compose up -d --build

# Oprire
docker compose down

# Reset complet (sterge si datele din DB)
docker compose down -v

# Vezi log-uri backend
docker compose logs -f backend

# Acceseaza DB direct
docker compose exec postgres psql -U taskuser -d taskmanager
```
