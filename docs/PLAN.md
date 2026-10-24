# Dealership Inventory — Delivery Plan

Deployment target is deferred (Cloudflare vs Railway/GCP, pending HR). Everything below is
deployment-agnostic; the deploy job in CI is the only piece that changes later.

Stack: Next.js (TypeScript, App Router) · FastAPI (Python) · PostgreSQL · GitHub Actions.

---

## 1. Repository layout (monorepo)

```
dealership-app/
├── backend/                 FastAPI service
│   ├── app/
│   │   ├── main.py          app factory, routers, error handlers
│   │   ├── config.py        settings from env vars
│   │   ├── db.py            asyncpg pool + helpers
│   │   ├── auth.py          password hashing, JWT issue/verify, session revocation
│   │   ├── deps.py          FastAPI dependencies: current_user, require_admin
│   │   ├── routers/
│   │   │   ├── health.py    GET /api/health
│   │   │   ├── auth.py      POST /api/auth/login, /logout, GET /api/auth/me
│   │   │   └── vehicles.py  GET /api/vehicles, GET/PUT /api/vehicles/{id}
│   │   ├── repositories/
│   │   │   └── vehicles.py  SQL lives here, incl. the atomic conditional UPDATE
│   │   └── schemas.py       pydantic request/response models
│   ├── migrations/          numbered SQL files, forward-only
│   │   └── 001_init.sql
│   ├── scripts/
│   │   ├── migrate.py       applies pending migrations, records in schema_migrations
│   │   ├── seed.py          idempotent deterministic seed (2 dealerships, 6 users, 6+ vehicles)
│   │   ├── reset.py         drop + migrate + seed (dev/CI only)
│   │   └── smoke.py         runs against any BASE_URL; used post-deploy
│   ├── tests/
│   │   ├── conftest.py      real Postgres, schema per session, truncate+reseed per test
│   │   ├── test_auth.py
│   │   ├── test_access.py   role + dealership boundary tests
│   │   ├── test_vehicles.py
│   │   └── test_concurrency.py   lost-update regression test
│   ├── pyproject.toml
│   └── .env.example
├── frontend/                Next.js
│   ├── app/
│   │   ├── login/page.tsx
│   │   ├── vehicles/page.tsx
│   │   └── vehicles/[id]/edit/page.tsx
│   ├── lib/api.ts           fetch wrapper: 401/403/409/network handling in one place
│   ├── lib/session.ts       token storage, logout
│   ├── e2e/                 Playwright
│   │   ├── workflow.spec.ts login → list → edit → reload persists
│   │   └── conflict.spec.ts two browser contexts, same vehicle, one gets 409 banner
│   ├── package.json / package-lock.json
│   └── .env.example
├── .github/workflows/
│   ├── ci.yml               PR + main: lint, test, build, e2e
│   └── deploy.yml           main only, needs ci green → deploy → migrate → smoke
├── docker-compose.yml       local Postgres only
├── docs/
│   ├── PLAN.md              this file
│   └── DECISIONS.md         tradeoffs, written as we go; feeds README + Loom
└── README.md
```

---

## 2. Data model

```sql
dealerships(id uuid pk, name text unique)
users(id uuid pk, email text unique, password_hash text, role text check (role in ('admin','viewer')),
      dealership_id uuid fk, created_at)
sessions(id uuid pk, user_id fk, issued_at, expires_at, revoked_at null)   -- enables real logout/invalidation
vehicles(id uuid pk, dealership_id uuid fk, make, model, year int check (1900..2100),
         status text check (status in ('available','reserved','sold')),
         version int not null default 1, updated_at timestamptz)
index vehicles(dealership_id)
schema_migrations(version text pk, applied_at)
```

Seed (deterministic ids/emails so tests and the README agree):

| Dealership      | Admins                                                 | Viewer                 |
|-----------------|--------------------------------------------------------|------------------------|
| North Motors    | admin1@north.test, admin2@north.test                   | viewer@north.test      |
| South Autos     | admin1@south.test, admin2@south.test                   | viewer@south.test      |

Three vehicles each, fixed UUIDs. One shared seed password for all reviewer accounts, documented in README.

---

## 3. Backend design

**Auth**
- Login verifies PBKDF2-HMAC-SHA256 hash (stdlib, portable to any runtime incl. Workers; swap to
  bcrypt later if target allows). Returns a JWT (HS256, PyJWT) with `sub`, `sid` (session id),
  `role`, `dealership_id`, `exp` (30 min).
- Every protected request: verify signature + exp, then check `sessions.revoked_at IS NULL`
  and `expires_at > now()`. Expired or revoked → 401 with code `token_expired` / `token_revoked`.
- Logout sets `revoked_at` on the session. Demonstrates true invalidation, not just client-side forget.
- Token transport: `Authorization: Bearer`. Chosen because it works whether frontend and API end up
  on the same origin or not. Tradeoff (XSS exposure vs cookie CSRF) goes in DECISIONS.md.

**Authorization: trusted context only**
- `dealership_id` and `role` come from the verified token/session, never from the request body or URL.
- `require_admin` dependency → 403 `forbidden` for viewers.
- All vehicle SQL includes `AND dealership_id = <current user's dealership>`. Reading or updating
  another dealership's vehicle returns 404 `not_found` (no existence leak). Documented choice; 403
  would be equally acceptable but leaks existence.

**Atomic optimistic locking (the core of the assessment)**
```sql
UPDATE vehicles
   SET make=$1, model=$2, year=$3, status=$4, version = version + 1, updated_at = now()
 WHERE id=$5 AND dealership_id=$6 AND version=$7
RETURNING *;
```
- 1 row → 200 with the new record (client gets the new `version`).
- 0 rows → follow-up `SELECT` scoped to dealership: row exists → 409 `version_conflict` with the
  current record in the body; no row → 404.
- Single statement = check and write are one atomic operation under Postgres row locking. No
  read-then-write window. No transaction gymnastics needed.

**Error envelope** (every non-2xx): `{"error": {"code": "...", "message": "..."}}`.
Codes: `invalid_credentials`, `unauthenticated`, `token_expired`, `token_revoked`, `forbidden`,
`not_found`, `version_conflict`, `validation_error`, `internal_error`.

**Health**: `GET /api/health` → `{"status":"ok","db":"ok","version":"<git sha>"}`. No config echo.

---

## 4. Frontend design

- `lib/api.ts` is the only place that calls fetch. It maps: 401 → clear session, redirect to
  /login?reason=expired; 403 → inline "no permission" banner; 409 → conflict banner showing
  current server values + "Reload latest" button that refetches and resets the form with the
  new version; network/5xx → generic error with retry.
- Vehicle list: shows dealership name, loading skeleton, empty state, error state. Edit button only
  for admins (cosmetic; backend is the real gate).
- Edit form: hidden `version` field captured at load time, sent with the PUT. After success, form
  version updates to the returned one. Reload persists because data is server-side.
- Styling: plain CSS modules or Tailwind, minimal. No component library.

---

## 5. QA strategy

**Backend (pytest + httpx AsyncClient, real Postgres)**
- No mocks for the DB. Local: docker-compose Postgres. CI: Postgres service container.
- Session fixture: migrate once. Function fixture: truncate + reseed → every test starts from the
  same known state. Fast (6 users, 6 vehicles).
- Required cases (map 1:1 to the PDF so the README can point at test names):

| Test | Asserts |
|---|---|
| login valid / invalid | 200 + token / 401, no token |
| no token / garbage token / expired token / revoked token | 401 each, correct code |
| admin update own vehicle | 200, version+1, DB row changed |
| viewer PUT | 403 **and DB row unchanged** |
| cross-dealership GET and PUT | 404 **and DB row unchanged** |
| validation (year out of range, bad status) | 422/400, DB unchanged |
| logout then reuse token | 401 token_revoked |
| **lost-update regression** | exactly one 200, one 409, DB holds winner's values |

**Concurrency regression test design (must be deterministic, not flaky)**
- Both admins GET the vehicle (version 1). Both PUT different changes with `version: 1`,
  fired concurrently with `asyncio.gather`.
- Assert: status codes are `{200, 409}` as a multiset; the 409 body carries the current record;
  the DB row equals the 200 response's values; version is exactly 2.
- Also a sequential variant (second PUT after first completed) for readability.
- To make the *defective* variant fail deterministically rather than by luck of timing, the
  repository exposes a test-only async hook `after_read` (no-op in prod). The defective
  implementation (read version → compare → unconditional UPDATE) awaits it between read and
  write; the test installs a barrier so both requests read before either writes → both succeed
  → test fails with two 200s and a lost update. The fixed implementation has no read step, so
  the hook is never reached. This is the "how the test reveals the defect" explanation for the Loom.

**Defective-variant demonstration via git history**
1. Commit `feat: vehicle update (naive read-then-write)` — the defective repository method.
2. Commit `test: add lost-update regression test` — CI run is RED. Save the run link.
3. Commit `fix: atomic conditional UPDATE for vehicle edits` — CI run is GREEN. Save the link.
README lists all three SHAs + run links. Only the fixed code is ever deployed (deploy job is
gated on green). Optionally tag `defect-demo` on commit 2 for easy checkout.

**Frontend / E2E (Playwright)**
- `workflow.spec.ts`: login as admin → list shows 3 vehicles of own dealership only → edit →
  save → reload → change persisted → logout → protected page redirects to login.
- `conflict.spec.ts`: two browser contexts logged in as admin1 and admin2 → both open same edit
  page → A saves (ok) → B saves → B sees conflict banner → clicks Reload → sees A's values →
  saves successfully. This doubles as the documented "how to reproduce the frontend conflict state".
- Viewer: edit button absent; direct navigation to edit page shows forbidden message on save.

**Smoke test (`scripts/smoke.py BASE_URL`)**
Login → allowed admin update (then revert) → viewer PUT expects 403 → stale PUT expects 409 →
health 200. Prints a table; non-zero exit on any failure. Runs in CI after deploy; also runnable
by hand for README evidence.

**Static checks**: ruff + mypy (backend), eslint + tsc + next build (frontend).

---

## 6. Git workflow

- `main` protected: require PR, require status checks `backend`, `frontend`, `e2e` to pass.
- Short-lived feature branches, PRs even solo (reviewers want to see checks running on PRs).
- Conventional commit messages. Suggested sequence (tells the story in the log):
  1. `chore: scaffold monorepo, docker-compose postgres, CI skeleton`
  2. `feat(db): schema migration + deterministic seed`
  3. `feat(auth): login/logout/me with session revocation`
  4. `feat(vehicles): scoped list/get + naive update`      ← defective
  5. `test: access-boundary tests + lost-update regression`  ← RED
  6. `fix(vehicles): atomic conditional update`               ← GREEN
  7. `feat(web): login, inventory, edit form, error + conflict UX`
  8. `test(e2e): workflow + conflict specs`
  9. `ci: deploy workflow gated on checks + smoke test`
  10. `docs: README, decisions, reviewer accounts`
- Never commit `.env`; commit `.env.example`. Pre-commit hook or gitleaks action optional.

---

## 7. CI/CD (GitHub Actions)

**`ci.yml`** — `on: pull_request` and `on: push: branches: [main]`
- `backend`: Postgres 16 service container → `uv sync` → ruff → mypy → migrate → pytest (junit
  + coverage artifact).
- `frontend`: npm ci → eslint → tsc → next build.
- `e2e`: needs backend+frontend → start Postgres service → migrate+seed → run API + web →
  Playwright → upload trace on failure.

**`deploy.yml`** — `on: push: branches: [main]` (or `workflow_run` on ci success)
- `needs: [backend, frontend, e2e]` (or checks `workflow_run.conclusion == 'success'`).
  A failing required check ⇒ this job never runs. That is the gating story.
- Steps: build → run migrations against prod DB → deploy frontend + API (target-specific; TBD) →
  `smoke.py $DEPLOYED_URL` → fail the job if smoke fails.
- `concurrency: production` so two merges do not deploy in parallel.
- `workflow_dispatch` input `ref` to redeploy any previous commit = the rollback mechanism.
- Secrets (names only, values in GitHub Secrets): `DATABASE_URL`, `JWT_SECRET`, plus the target
  platform's deploy token. Documented in README; `.env.example` mirrors the names.

**Release recovery (documented, not demoed)**
- Code: rerun `deploy.yml` via workflow_dispatch on the last good SHA, or platform rollback.
- Data: migrations are forward-only and additive; a rollback of code never requires a down
  migration for this schema. If a future migration drops/renames columns, expand → migrate →
  contract across two releases. State this limitation explicitly.

---

## 8. Local developer experience

```
docker compose up -d db
cd backend && uv sync && uv run python scripts/reset.py && uv run uvicorn app.main:app --reload
cd frontend && npm ci && npm run dev
make test / make e2e / make smoke BASE_URL=...
```
`.env.example` in both packages. One `make` (or `justfile`/npm scripts) front door.

---

## 9. Time budget (4 h focused, excl. account setup)

| Block | Time | Output |
|---|---|---|
| Scaffold, compose, schema, seed, CI skeleton | 35 min | commits 1–2, first green CI |
| Auth + sessions + tests | 40 min | commit 3 |
| Vehicles API naive → tests → atomic fix | 50 min | commits 4–6, RED→GREEN runs captured |
| Frontend pages + error/conflict UX | 50 min | commit 7 |
| Playwright workflow + conflict | 30 min | commit 8 |
| Deploy workflow + smoke + run | 25 min + unattended | commit 9 |
| README + DECISIONS + Loom | 30 min | commit 10, video |

If over budget, cut in this order: Playwright conflict spec (keep API test) → mypy → styling.
Never cut: atomic update, access tests, regression demo, deploy gating, README honesty section.

---

## 10. Open decisions

- Deploy target (Cloudflare Python Workers vs Railway/Cloud Run). Affects: Python version
  (Workers needs 3.13 + pure/wasm packages), bcrypt vs PBKDF2, static-export vs SSR Next.js,
  deploy step in `deploy.yml`. Nothing in sections 2–6 changes.
- Hosted Postgres (Neon vs Supabase vs platform add-on). Only `DATABASE_URL` changes.
