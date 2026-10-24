# Decisions and tradeoffs

Each entry: what was chosen, why, and what it costs. These are the points to defend in the
walkthrough.

## Application structure

**Monorepo with `backend/` and `frontend/`.**
One commit can change the API and its client together, one CI run tests them together, and one
`needs:` list gates deployment. Each folder has its own dependencies and lockfile, so splitting
later is mechanical. Separate repos would make the E2E job and deploy gating cross-repo.

**Layered FastAPI backend: routes, services, repositories, schemas, core.**
- *Routes* only parse input and pick a dependency: `AuthUser` or `AdminUser`.
- *Services* hold use-case logic, such as deciding between 409 and 404 when an update matched nothing.
- *Repositories* hold all SQL, so dealership scoping is visible in one place per table.
Cost: more files than a single-module app, but each file has one job.

**Raw SQL with asyncpg, no ORM.**
The core requirement is one specific atomic statement. Writing it directly makes the
concurrency guarantee readable. Async SQLAlchemy also does not run on Cloudflare Python Workers,
because greenlet is unavailable. Cost: hand-written mapping, acceptable for four tables.

**One JSON error envelope:** `{"error": {"code", "message", "details?"}}`.
The frontend switches on `code`, never on message text. Validation errors list fields.
401 responses include `WWW-Authenticate: Bearer`.

## Authentication and authorization

**JWT plus a server-side `sessions` table.**
A JWT alone cannot be revoked, so logout would only forget the token in the browser. With a
session row, logout sets `revoked_at` and the token stops working immediately. The cost is one
primary-key lookup per request.

**Role and dealership read from the database on every request.**
They are not trusted from the token or the body. A role change takes effect on the next request.

**PBKDF2-SHA256 from the standard library, 600,000 iterations.**
It has no native extension, so it works on any Python host, including Cloudflare Workers where
bcrypt or argon2 wheels may not exist. The iteration count is stored in each hash, so it can be
raised later. Tests use 1,000 iterations for speed; the code path is identical.

**Cross-dealership access returns 404, not 403.**
A 403 would confirm the vehicle exists at another dealership. Viewers attempting an edit get
403, because their role, not the resource's existence, is the problem.

**Token in `sessionStorage`, sent as a Bearer header.**
- *For:* it works whether frontend and API share an origin or not. There is no CSRF exposure,
  because nothing is sent automatically. It is per tab, so two admins can test conflicts in one
  browser.
- *Against:* JavaScript can read it, so an XSS bug could exfiltrate it. The alternative is an
  httpOnly SameSite cookie plus CSRF protection. That is a reasonable next step now that
  production will be single-origin.

## Concurrency

**Optimistic locking with an integer `version` column.**
Clients echo the version they loaded. The repository runs one
`UPDATE ... WHERE id AND dealership_id AND version = $expected RETURNING ...`.

- *Why not `SELECT ... FOR UPDATE` in a transaction?* That is also correct, but needs two
  statements and an explicit transaction. The conditional update is shorter, holds the lock for
  less time, and the check is visibly part of the write.
- *Why not compare `updated_at`?* Timestamps can collide and depend on clock precision. An
  integer that increments in the same statement cannot.

**Deterministic regression test.**
A naive race test passes or fails depending on scheduling. The defective code awaited a hook
between its read and write. The test installs a barrier there, forcing the bad interleaving
every time. The fix has no read step, so the hook disappears with it.

**Frontend: block retry until refresh.**
On 409 the form is disabled and shows the current saved values next to the user's edit.
Saving is possible only after "Refresh to latest version". This follows the assessment's
"ask the user to refresh before retrying". An automatic merge could silently combine
incompatible edits.

## Frontend

**Next.js static export, client-side data fetching.**
All data is per-user and needs the bearer token, so server rendering adds nothing. The output is
plain files, which Cloudflare serves as static assets next to the API. Costs: no rewrites or
middleware, and no dynamic route segments. The edit page therefore uses `/vehicles/edit/?id=`.

**Next 16 `cacheComponents` turned off.** It needs a Node server, and a static export has none.

**One API client (`lib/api.ts`).** Every page gets consistent 401, 403, 404, 409, 422 and
network handling. Any 401 signs the user out and records why. The route guard is the only
code that redirects to `/login`. The E2E suite caught a bug when two places redirected: the
reason message was lost.

**Tailwind and hand-built components, no component library.**
Lucide supplies the icons. The bundle stays small, and the UI is consistent and accessible:
labels, roles, focus rings and live regions.

## QA

**Real Postgres in every test, no database mocks.**
The behaviour under test, scoping and atomicity, lives in SQL. A mock would test the mock.

**Isolated test database (`dealership_test`), reseeded before each test.**
Tests never touch development data, and their order does not matter.

**E2E in the production shape.**
FastAPI serves the built static frontend on one origin, as Cloudflare will. Playwright drives
real Chromium.

**Smoke script uses only the standard library.**
It runs from a deploy job or any laptop without installing anything, and it restores what it
changes.

## Delivery

**Merge commits, not squash.**
Squashing would erase the red commit `de5c4fc` from `main`, which is the evidence for the
regression demonstration.

**CI concurrency cancels superseded runs per branch.**
This saves minutes. The red run had to finish before the fix was pushed, so its failure was
recorded.

**Python 3.13 in CI.** Cloudflare Python Workers require it. Local development also works on 3.12.

## Cloudflare deployment

**One Worker for API and frontend, on the free `workers.dev` URL.**
The static export is uploaded as Workers static assets; `run_worker_first: ["/api/*"]` sends
only API calls to Python. Pages never spend Worker CPU or count as Worker invocations, and the
browser sees one origin, so there is no CORS and no cookie or domain complexity.

**FastAPI on Python Workers, unchanged.**
`cloudflare/src/entry.py` builds the same app and overrides three FastAPI dependencies:
connection, health ping, and settings. Business code, SQL and tests are shared with local and
CI. The app factory reads no configuration at import time, because Cloudflare imports and
snapshots the module at deploy time, before any secret exists.

**Neon Postgres through Hyperdrive.**
The job's stack is Postgres, and the concurrency fix relies on Postgres row locking.
Cloudflare's own database, D1, is SQLite and would have meant re-validating the atomic update.
Hyperdrive keeps pooled connections close to Neon, so a connection per request is cheap.
It is included in the free plan.

**Password hashing via WebCrypto with fewer iterations.**
The free plan allows 10 ms of CPU per request. PBKDF2 compiled to WebAssembly is far too slow,
so the Worker calls the runtime's native WebCrypto PBKDF2. Even native, 600,000 iterations
costs about 370 ms. The deployed default is 10,000, about 6 ms. This is the main security
tradeoff of the free-plan requirement. It is configurable without code changes and
documented as a limitation.

**Deploy packaging copies `backend/app` into `cloudflare/src/app`.**
Cloudflare uploads every `.py` file under the entry module's folder, including virtualenvs.
Copying keeps `backend/` a normal Python project and the Worker bundle minimal.

**Seeding on deploy is `--if-empty` only.**
A first deploy gets demo data. Later deploys never wipe edits. A full reset is an explicit
manual-run option.

**Manual runs with a `ref` input.**
Rollback reuses the same gated path as a normal release: check, then deploy that commit.
`wrangler rollback` stays available for an instant revert.
