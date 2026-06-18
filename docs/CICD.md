# CI/CD pentru Weekly Task Manager

Un ghid practic, în română, despre **Continuous Integration** și **Continuous Delivery / Deployment**, explicat pe codul *acestui* proiect: backend FastAPI + SQLAlchemy + Alembic, frontend React + Vite + TypeScript, bot Telegram, totul orchestrat cu `docker compose` peste Postgres.

> Citește acest document cu fișierele deschise alături:
> - `.github/workflows/tests.yml` — workflow-ul de CI (deja adăugat)
> - `backend/pytest.ini` — gate-ul de coverage pe backend
> - `frontend/vitest.config.ts` — configul de coverage pe frontend
> - `docker-compose.yml` — cum rulează serviciile

---

## 1. Ce este CI (Continuous Integration)

**Continuous Integration** = integrezi (merge) modificările tale în ramura comună **des** (ideal de mai multe ori pe zi), iar de fiecare dată o mașină automată **construiește și verifică** codul.

### Ce probleme rezolvă

- **Merge hell** — dacă lucrezi două săptămâni pe un branch izolat, ramura ta și `main` divergă masiv. Când în sfârșit faci merge, ai zeci de conflicte. Integrând des, fiecare merge e mic și ușor de rezolvat.
- **„Merge la mine pe calculator”** — clasicul „dar la mine merge”. CI rulează testele într-un mediu **curat și identic de fiecare dată** (un container Ubuntu proaspăt, vezi `runs-on: ubuntu-latest`). Dacă merge acolo, merge la oricine; dacă pică, nu e vina laptopului tău.
- **Regresii prinse târziu** — fără CI, un bug introdus luni e descoperit abia vineri, după ce s-au mai pus 20 de commit-uri peste. CI rulează la **fiecare push**, deci afli în câteva minute, nu peste o săptămână.

### Ce e un „pipeline”

Un **pipeline** este lanțul automat de pași prin care trece codul tău după ce dai push: *checkout → instalare dependențe → rulare teste → raport*. Dacă orice pas eșuează, pipeline-ul se oprește și commit-ul e marcat **roșu** (failed). Dacă toți pașii trec, e **verde** (passed).

În acest proiect, pipeline-ul de CI e definit în `.github/workflows/tests.yml` și rulează pe **GitHub Actions**.

---

## 2. Ce este CD — Delivery vs Deployment

„CD” înseamnă două lucruri **diferite**, des confundate:

### Continuous Delivery (livrare continuă)

După ce CI trece, pipeline-ul **construiește automat un artefact gata de release** (ex: o imagine Docker versionată), dar **lansarea efectivă în producție rămâne o decizie manuală** — apeși un buton „Deploy” / aprobi un release.

> Exemplu: la fiecare merge pe `main`, se construiește imaginea `taskmanager-backend:sha-abc123` și se urcă într-un registry. Imaginea e *gata de a fi pusă în producție oricând*, dar tu alegi **când** apeși deploy.

### Continuous Deployment (desfășurare continuă)

Pas mai departe: dacă CI trece pe `main`, codul ajunge **automat în producție**, fără aprobare umană. Zero butoane.

> Exemplu: faci merge pe `main` → testele trec → pipeline-ul face singur `docker compose pull && docker compose up -d` pe server → noua versiune e live în câteva minute.

| | Cine apasă „release”? | Risc | Cui i se potrivește |
|---|---|---|---|
| **Delivery** | Tu (manual) | Mai mic — controlezi momentul | Proiecte cu un singur owner, cum e ăsta |
| **Deployment** | Nimeni (automat) | Mai mare — ai nevoie de teste foarte bune | Echipe cu suite de teste mature |

Pentru un proiect cu un singur owner ca ăsta, **Continuous Delivery** (sau deploy semi-automat declanșat manual) e alegerea sănătoasă: păstrezi controlul asupra momentului în care utilizatorii primesc o versiune nouă.

---

## 3. CI/CD în practică pe ACEST proiect

### 3.1. Workflow-ul `.github/workflows/tests.yml`, explicat

```yaml
name: tests

on:
  push:
  pull_request:
```

- **`name: tests`** — numele workflow-ului, așa cum apare în tab-ul *Actions* de pe GitHub.
- **`on:`** — **trigger-ele**: *când* rulează pipeline-ul.
  - `push:` — la **orice** push, pe orice branch.
  - `pull_request:` — la deschiderea / actualizarea unui PR.
  - Astfel testele rulează și pe branch-ul de feature (push), și ca **check** pe PR înainte de merge.

```yaml
jobs:
  backend:
    name: Backend (pytest + coverage ≥85%)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
```

- **`jobs:`** — un workflow conține unul sau mai multe **job-uri**. Aici sunt două: `backend` și `frontend`.
- **Job** = o unitate de lucru care rulează pe propria mașină virtuală, izolat. Cele două job-uri rulează **în paralel** (nu există dependență între ele cu `needs:`), deci feedback-ul vine mai repede: nu aștepți backend-ul ca să afli că frontend-ul a picat.
- **`runs-on: ubuntu-latest`** — **runner-ul**: mașina (un Ubuntu curat, efemer) pe care GitHub rulează job-ul. Pornește gol de fiecare dată — de-aia CI nu suferă de „merge la mine pe calculator”.
- **`defaults.run.working-directory: backend`** — toate comenzile `run` din acest job se execută din folderul `backend/` (acolo trăiește `pytest.ini`).

```yaml
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: pip
      - name: Install deps
        run: pip install -r requirements.txt
      - name: Run tests with coverage gate
        run: pytest
```

- **`steps:`** — pașii job-ului, executați **secvențial** de sus în jos. Dacă un pas eșuează, restul nu mai rulează.
- **`uses:`** — refolosește o **action** (o componentă reutilizabilă scrisă de comunitate / GitHub):
  - `actions/checkout@v4` — clonează codul tău în runner (altfel mașina e goală).
  - `actions/setup-python@v5` cu `python-version: "3.11"` — instalează exact Python 3.11, ca să testezi pe aceeași versiune ca în producție.
  - **`cache: pip`** — păstrează pachetele pip descărcate între rulări. La primul build se descarcă tot; la următoarele, dacă `requirements.txt` nu s-a schimbat, le ia din cache → pipeline mult mai rapid.
- **`run:`** — comandă shell normală. `pip install -r requirements.txt` instalează dependențele, `pytest` rulează testele.

Job-ul `frontend` e analog, dar pentru Node:

```yaml
  frontend:
    name: Frontend (vitest + coverage ≥85%)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - name: Install deps
        run: npm ci
      - name: Run tests with coverage gate
        run: npm run test:cov
```

- `setup-node@v4` cu `node-version: "20"` — Node 20.
- **`cache: npm`** + `cache-dependency-path: frontend/package-lock.json` — cache pe baza lock-file-ului. Dacă `package-lock.json` nu se schimbă, dependențele vin din cache.
- **`npm ci`** (nu `npm install`) — instalare „curată”, deterministă, strict din `package-lock.json`. E versiunea pentru CI: reproductibilă și mai rapidă.
- `npm run test:cov` — rulează vitest cu coverage.

> **De ce două job-uri separate?** Backend și frontend au runtime-uri diferite (Python vs Node), dependențe diferite și pot rula complet independent. Separându-le: (1) rulează în paralel → mai rapid; (2) vezi clar *care* parte a picat în tab-ul Actions; (3) fiecare are cache-ul lui.

### 3.2. Cum se leagă de gate-urile de coverage

**Coverage** = ce procent din liniile codului tău sunt efectiv executate de teste. Un **coverage gate** spune: „dacă acoperirea scade sub pragul X, considerăm build-ul eșuat”.

**Backend — `backend/pytest.ini`:**

```ini
[pytest]
testpaths = tests
addopts =
    --cov=app.services.membership_service
    --cov=app.services.project_service
    --cov=app.api.members
    --cov-report=term-missing
    --cov-fail-under=85
```

- `--cov=...` — *ce* module se măsoară. Acum include logica nouă a platformei PM: serviciile `sprint_service`, `board_service`, `quick_task_service`, `project_service`, `stats_service`, `report_share_service`, `collaboration_service`, `completion_service` + rutele `quick_tasks` / `report_shares` (pe lângă membership/project/members). Pe măsură ce adaugi cod nou, adaugi module aici.
- `--cov-report=term-missing` — afișează în log exact *ce linii* nu sunt acoperite.
- **`--cov-fail-under=85`** — **gate-ul**. Pragul e **agregat** peste toate modulele `--cov` de mai sus: dacă acoperirea totală scade sub **85%**, `pytest` întoarce cod de eroare ≠ 0 → pasul „Run tests” devine roșu → job-ul `backend` pică → întreg workflow-ul e roșu. Sursa de adevăr e `pytest.ini` (numele job-ului din workflow e doar etichetă).

**Frontend — `frontend/vitest.config.ts`:**

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'text-summary'],
  include: [
    'src/shared/utils/dates.ts',
    'src/features/projects/components/mention.ts',
    'src/features/projects/components/boardConstants.ts',
    'src/features/projects/hooks/applyOptimisticMove.ts',
    'src/features/projects/components/PerformancePanel.tsx',
  ],
},
```

- `provider: 'v8'` — motorul care măsoară coverage-ul.
- `include: [...]` — *ce* fișiere se măsoară (api clients, hooks, helpers și componentele noi). Lista a fost extinsă de la 5 la ~19 module.
- **`thresholds`** — **gate-ul** frontend (echivalentul lui `--cov-fail-under`). Acum e configurat:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'text-summary'],
  include: [ /* ...19 module... */ ],
  thresholds: {
    lines: 85,
    statements: 85,
    functions: 85,
    branches: 80,
  },
},
```

Cu `thresholds` setate, dacă acoperirea scade sub prag, `npm run test:cov` întoarce eroare → job-ul `frontend` devine roșu. (Rularea curentă: ~97% linii / 90% branch — peste prag.) `branches` e ținut la 80 ca să nu blocheze pe cod defensiv; ridică-l la 85 dacă vrei.

**„Build roșu / verde”, concret:** zici că ștergi un test sau adaugi 200 de linii de cod neacoperit. Coverage-ul scade sub prag → `pytest` / vitest ies cu eroare → check-ul de pe PR devine ❌ roșu → **nu poți face merge** (dacă activezi protecția de branch). Te forțează să scrii teste *înainte*, nu „cândva mai târziu”.

### 3.3. Ce vezi pe GitHub

- **Tab-ul „Actions”** — istoricul tuturor rulărilor, cu log-uri pe fiecare pas. Click pe o rulare → vezi exact ce linie a picat.
- **Checks pe Pull Request** — în josul PR-ului apar „Backend (...)” și „Frontend (...)” cu ✅ / ❌. Poți seta în *Settings → Branches* o **regulă de protecție** care interzice merge până ambele checks sunt verzi.
- **Badge** — un mic indicator în README care arată starea curentă a build-ului:

```markdown
![tests](https://github.com/<user>/<repo>/actions/workflows/tests.yml/badge.svg)
```

---

## 4. Cum ar arăta CD pentru acest proiect (momentan NU există)

Acum ai doar CI (teste). Pasul de **deploy** ar fi un job suplimentar care rulează **doar pe `main`** și **doar dacă testele au trecut**. Schiță (pseudo-YAML — *nu* o copia orbește, e un punct de plecare):

```yaml
  deploy:
    name: Build & Deploy (production)
    runs-on: ubuntu-latest
    needs: [backend, frontend]            # rulează DOAR dacă ambele job-uri de test au trecut
    if: github.ref == 'refs/heads/main'   # și DOAR pe branch-ul main (nu pe feature branches)
    steps:
      - uses: actions/checkout@v4

      # 1. Build & push imaginile Docker într-un registry
      - name: Log in to registry
        run: echo "${{ secrets.REGISTRY_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
      - name: Build & push backend
        run: |
          docker build -t ghcr.io/<user>/taskmanager-backend:${{ github.sha }} ./backend
          docker push ghcr.io/<user>/taskmanager-backend:${{ github.sha }}
      - name: Build & push frontend
        run: |
          docker build -t ghcr.io/<user>/taskmanager-frontend:${{ github.sha }} ./frontend
          docker push ghcr.io/<user>/taskmanager-frontend:${{ github.sha }}

      # 2. Deploy pe VPS prin SSH: pull imaginile noi + restart compose
      - name: Deploy on server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/taskmanager
            docker compose pull
            docker compose up -d
            docker compose exec -T backend alembic upgrade head
```

Observații legate de *acest* proiect:

- **Migrările Alembic**: deploy-ul trebuie să ruleze `alembic upgrade head` (deja parte din `start.sh`), altfel schema DB rămâne în urma codului.
- **Rețeaua `proxy`**: `docker-compose.yml` se bazează pe o rețea externă `proxy` (`docker network create proxy`, o singură dată pe server) ca nginx-proxy-ul să rezolve containerele după nume.
- **Botul Telegram** rulează în același proces cu backend-ul (din lifespan-ul FastAPI), deci la `docker compose up -d` se repornește automat odată cu backend-ul — nu are nevoie de pas separat.
- **`secrets.*`** = **GitHub Secrets** (*Settings → Secrets and variables → Actions*). Acolo pui token-ul de registry, host-ul, user-ul și **cheia SSH privată** de deploy. **Niciodată** valori reale în YAML — tot ce e sensibil trece prin `secrets`. La fel, `.env`-ul de producție (cu `TELEGRAM_BOT_TOKEN`, `JWT_SECRET`, `APP_PIN` etc.) stă **doar pe server**, nu în repo.
- Pentru **Continuous Delivery** (cu aprobare manuală) în loc de Deployment automat: pui job-ul `deploy` într-un *GitHub Environment* cu **required reviewers** — pipeline-ul se oprește și așteaptă să apeși „Approve” înainte să atingă serverul.

---

## 5. Flux zilnic recomandat

```
1. git checkout -b feat/nume-feature      # branch nou din main
2. ... scrii cod + teste ...
3. (LOCAL) rulezi verificările             # vezi mai jos — prinzi erorile înainte de push
4. git commit -m "feat: ..."
5. git push -u origin feat/nume-feature
6. Deschizi un Pull Request pe GitHub
7. CI rulează automat → aștepți ✅ verde
8. Merge în main (squash)
9. (cu CD) deploy automat / manual în producție
```

### Rulează aceleași verificări LOCAL, înainte de push

Ideea de aur: rulează *local* exact ce rulează CI, ca să nu aștepți 3 minute pe GitHub doar ca să afli că ai uitat un import. Comenzile sunt cele din `CLAUDE.md`, prin `docker compose`:

```bash
# Backend — exact ce rulează job-ul `backend` din CI:
docker compose exec backend pytest

# Frontend — exact ce rulează job-ul `frontend` din CI:
docker compose exec frontend npm run test:cov

# Bonus: doar typecheck pe frontend
docker compose exec frontend npx tsc -b
```

Dacă astea trec local, ai 99% șanse ca build-ul de pe GitHub să fie verde. Dacă pică local, le rezolvi *înainte* să consumi un ciclu de CI și înainte ca un coleg / tu peste o lună să dea de un `main` roșu.

> Sfat: poți pune comenzile astea într-un **git hook** (`pre-push`) ca să ruleze automat înainte de fiecare push.

---

## 6. Glosar scurt

- **Pipeline** — lanțul automat de pași (build → test → eventual deploy) prin care trece codul după push.
- **Job** — o unitate de lucru dintr-un workflow, rulată izolat pe propriul runner. Aici: `backend` și `frontend`.
- **Step** — un pas dintr-un job (un `uses:` sau un `run:`). Rulează secvențial.
- **Runner** — mașina (VM) pe care rulează un job. Aici: `ubuntu-latest`, un mediu curat și efemer.
- **Action** (`uses:`) — componentă reutilizabilă (ex: `actions/checkout@v4`).
- **Trigger** (`on:`) — evenimentul care pornește pipeline-ul (`push`, `pull_request`).
- **Artifact** — rezultatul unui build păstrat pentru folosire ulterioară (ex: o imagine Docker, un build de frontend, un raport de coverage).
- **Cache** — pachete (pip/npm) reținute între rulări ca să nu se redescarce de fiecare dată.
- **Coverage gate** — pragul minim de acoperire cu teste (`--cov-fail-under=85` în `pytest.ini`; `thresholds` în vitest). Sub prag → build roșu.
- **Green / Red build** — verde = toți pașii au trecut; roșu = ceva a eșuat (test picat, coverage sub prag, eroare de compilare).
- **Rollback** — revenirea la versiunea anterioară (stabilă) când un deploy nou se dovedește problematic — ex: redeploy pe imaginea cu SHA-ul precedent.
- **Staging vs Production** — *staging* = mediu „ca producția”, dar pentru testare internă, unde verifici înainte de a expune utilizatorilor; *production* = mediul real, cu utilizatorii și datele lor.
- **CI (Continuous Integration)** — integrezi des și verifici automat la fiecare push.
- **CD (Continuous Delivery)** — artefact gata de release, lansat cu aprobare manuală.
- **CD (Continuous Deployment)** — release în producție complet automat, fără aprobare.
