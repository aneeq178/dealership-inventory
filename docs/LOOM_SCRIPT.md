# Loom walkthrough script

Target length about 10 minutes, in this order: diagrams, then the UI flow with Cloudflare's
live logs, then the Postgres data, then the code, then QA. Talking points are prompts in your
own words, not lines to read.

A 30-minute extended version is in [LOOM_SCRIPT_30MIN.md](LOOM_SCRIPT_30MIN.md).

Live app: https://dealerdesk.aneeq02025.workers.dev · password for every demo account
`Dealer#2026`.

---

## Before you record (5 minutes)

1. **Reset the demo data** so the vehicles start at version 1. The Ford F-150 (N-1003)
   will show version 3: the pipeline's smoke test edits and restores it after every deploy. In GitHub, open **Actions**,
   then **CI/CD**, then **Run workflow**. Choose branch `main`, keep **deploy** ticked, and
   tick **reset_demo_data**. Wait for the green run of about 6 minutes.
2. **Open these tabs, left to right:**

   | # | Tab | Where |
   |---|---|---|
   | 1 | Diagrams | `docs/DealerDesk-System-Design.pdf`, or the PNGs in `docs/diagrams/` |
   | 2 | App as Alice | https://dealerdesk.aneeq02025.workers.dev |
   | 3 | App as Bob | Same URL in a second tab; sign-ins are per tab |
   | 4 | Cloudflare logs | Workers & Pages → **dealerdesk** → **Observability** → **Live** |
   | 5 | Neon SQL Editor | Neon → Dealership Inventory → **SQL Editor**, with `docs/demo_queries.sql` pasted in |
   | 6 | Code | Your editor, with the files from section 4 open |
   | 7 | Terminal | In `backend/`, with the virtualenv ready |
   | 8 | GitHub Actions | PR #2 and the run links from the README |

3. **Keep off screen:** GitHub's secret values, Cloudflare API tokens, Neon passwords, and
   the `cf` block inside an expanded Cloudflare log event, which shows your approximate
   location. Turn off notifications.

---

## 1 · Architecture diagrams (about 1:30)

**Open the PDF on the "How to read this document" page.** Say in one line: high-level design
is the parts and how they connect; low-level design is how each part works inside.

**Show Figure 3, deployment architecture.**
- One Cloudflare Worker serves both halves on one origin: Next.js static files, and FastAPI
  for `/api/*` only.
- Postgres is Neon. Hyperdrive sits between them and keeps pooled connections, with
  caching off so reads are never stale.
- GitHub Actions is the only path to production.

**Show Figure 6, the CI/CD pipeline** (landscape page). Follow the lettered connectors.
- Four checks run on every PR. Deploy runs only on `main` and only after all of them pass.
- The deploy steps are ordered so cheap checks (config, token) fail before anything changes
  (migration).

**Show Figure 11, two admins at once.** This is the heart of it.
- Both send version 1. The version check is part of the UPDATE, so Postgres serialises them
  on the row lock. The second matches zero rows and gets 409.

**Show Figure 14, the data model, briefly.**
- Users and vehicles each belong to exactly one dealership. Sessions make logout real.
  `version` is the optimistic lock.

> For deeper questions: Figure 7 (backend layers), Figure 8 (login), Figure 9 (token and
> session validation), Figure 10 (vehicle update) and Figure 13 (edit page).

---

## 2 · UI flow with Cloudflare's live logs (about 2:00)

Put the app (tab 2) and Cloudflare **Observability → Live** (tab 4) side by side. Each
action below makes a request appear in the log.

| Do in the app | Appears in the live log |
|---|---|
| Sign in as `alice.admin@northside.test` | `POST /api/auth/login` |
| Inventory loads: 4 Northside vehicles, no Southgate stock | `GET /api/vehicles` |
| Open **2022 Toyota Camry**: version 1 | `GET /api/vehicles/{id}` |
| In tab 3 sign in as `bob.admin@northside.test` and open the same Camry | `POST /api/auth/login`, `GET …/{id}` |
| Alice changes the model, then **Save changes**: "version 2" | `PUT /api/vehicles/{id}` → 200 |
| Bob changes the status, then **Save changes** | `PUT /api/vehicles/{id}` → **409** |
| Point at Bob's conflict panel: who saved, the diff, Save disabled | |
| Bob clicks **Refresh to latest version**, re-applies, saves: "version 3" | `GET …/{id}`, then `PUT` → 200 |
| Reload Alice's page: both changes persisted | `GET …/{id}` |
| Sign out Bob, then sign in as `victor.viewer@northside.test`: read-only notice, **View** links only | `POST …/logout` → 204, login |

**Click one `PUT` event in the log** and point at `"status"` and `"cpuTimeMs"`. Scroll past
the `cf` section.

**Talking points**
- The conflict is caught on the server. The UI only explains it and forces a refresh.
- The viewer's missing Edit button is cosmetic. Section 5 shows the API itself rejecting a viewer.

---

## 3 · Postgres data in Neon (about 1:15)

Run the queries from `docs/demo_queries.sql` in the SQL Editor (tab 5).

1. **Query 1, inventory.** The Camry is at **version 3, updated by Bob Chen**: Alice took it
   from 1 to 2, Bob from 2 to 3. The other rows are at version 1, except the Ford F-150 that
   the deploy's smoke test touched. The rejected 409 changed
   nothing.
2. **Query 3, sessions.** There are rows for Alice, Bob and Victor. Bob's has `revoked`
   filled in from the logout, so his token is now dead on the server.
3. **Query 2, users.** One dealership each, two admins and a viewer per dealership.
   Passwords exist only as `pbkdf2_sha256` hashes, and every hash differs because each has
   its own salt.
4. **Query 4, isolation.** Four vehicles per dealership, separated by foreign key.
5. **Query 5, migrations.** `001_init`, applied by the pipeline.

---

## 4 · Code (about 2:00)

| File | Lines | Point |
|---|---|---|
| `backend/app/api/deps.py` | 41–77 | `current_user`. (1) Bearer present. (2) JWT signature and `exp`. (3) The session row exists, isn't revoked, isn't expired. Each failure is a distinct 401. |
| same | 80–85 | `require_admin` returns 403 before any SQL runs |
| `backend/app/repositories/users.py` | 22 | `get_by_session`: role and dealership come from the database on every request, never from the request |
| `backend/app/repositories/vehicles.py` | 33–72 | **The atomic update.** `WHERE id AND dealership_id AND version = $8`. The check and the write are one statement. |
| `backend/app/services/vehicles.py` | 31–60 | Zero rows means re-read inside the caller's dealership: 409 if it exists, otherwise 404 |
| `frontend/app/vehicles/edit/page.tsx` | 242 | The form sends the version it loaded |
| `frontend/lib/api.ts` | 96 | Any 401 signs out with a reason |
| `cloudflare/src/entry.py` | 88–90 | The same FastAPI app on Cloudflare, with three dependency overrides |
| `.github/workflows/ci.yml` | 214–220 | Deploy `needs` every check and runs only on `main` |
| same | 257 | Token verified with Cloudflare before migrating |

Optionally, open **Settings → Secrets and variables → Actions** in GitHub to show that the
secret **names** exist. Values are never shown.

---

## 5 · QA: failed and passed (about 2:30)

**a. The regression test failing, then passing.**
1. Open PR #2 and its two commits.
2. `de5c4fc` adds only `test_concurrency.py`, and its
   [red run](https://github.com/aneeq178/dealership-inventory/actions/runs/40089597027) shows
   `got [200, 200]: a stale edit was accepted (lost update)`.
3. `6dc1a40` is the atomic fix, and its
   [green run](https://github.com/aneeq178/dealership-inventory/actions/runs/40089805129) passes.
4. In `backend/tests/test_concurrency.py`, line 52 installs a barrier between read and write,
   so the defective code fails every time, not by luck. Line 77 holds the assertion.

**b. Reproduce it live in the terminal (tab 7, in `backend/`):**

```bash
git checkout de5c4fc -- app/repositories/vehicles.py
.venv/Scripts/python -m pytest tests/test_concurrency.py -q
git checkout HEAD -- app/repositories/vehicles.py
.venv/Scripts/python -m pytest tests/test_concurrency.py -q
```

The first run fails with 1 failed: `[200, 200]`. The second passes with 2 passed.

**c. The whole suite:**

```bash
.venv/Scripts/python -m pytest -q
```

Expect 55 passed. Every rejected write in these tests also checks the database row is unchanged.

**d. Direct API calls against production, bypassing the UI.** This covers the viewer and
cross-dealership rejections:

```bash
.venv/Scripts/python scripts/smoke.py https://dealerdesk.aneeq02025.workers.dev
.venv/Scripts/python scripts/live_race.py https://dealerdesk.aneeq02025.workers.dev
```

- **smoke:** 15 PASS lines, including viewer edit 403, other dealership 404, stale edit 409,
  and logout revocation.
- **live_race:** 5 rounds of truly simultaneous saves, each with exactly one 200 and one 409.

**e. The pipeline blocking bad releases.** Show the README section "First deployment: what
failed". Four failed runs each stopped at the first gate that could detect the problem. Then
show the green run with every job passing and smoke 15/15.

---

## 6 · Tradeoffs, gaps, next step (about 0:45)

- **Tradeoff: Python on the Workers free plan.** Measured CPU per request is about 25 to
  130 ms median, against a documented 10 ms limit. Cloudflare served all 45 measured requests,
  but under real load the fix is Workers Paid ($5 a month).
- **Tradeoff: password hashing.** It uses 10,000 PBKDF2 iterations on Cloudflare against
  600,000 locally. The measurements show hashing isn't the main CPU cost, so the count could
  go back up.
- **Gap: no live rollback rehearsal.** The path is documented: a manual run with an older
  `ref`, or `wrangler rollback`. Migrations are forward-only.
- **Gap: the token lives in `sessionStorage`.** The next improvement is httpOnly cookies, now
  that production is one origin.
- **Next priority:** rate-limit login, then move to cookie sessions.

---

## Coverage of the assessment's video checklist

| Assessment item (section 9) | Where in this script |
|---|---|
| 1. Login, scoped list, admin update, logout on the deployed app | Section 2 |
| 2. Frontend, backend, storage, hosting structure | Section 1, Figures 2, 3, 7 |
| 3. Auth validation, expiry and invalidation | Section 4 `deps.py`, section 3 query 3 |
| 4. Viewer and cross-dealership rejection via direct API | Section 5d, `smoke.py` |
| 5. Stale-edit conflict, atomic logic, regression test, defective vs fixed | Sections 2, 4, 5a–5b |
| 6. Checks, gating, deployment, secrets, health, recovery | Sections 1 (Figure 6), 4 (`ci.yml`), 5e, 6 |
| 7. Tradeoffs, gaps, unfinished work, next improvement | Section 6 |
