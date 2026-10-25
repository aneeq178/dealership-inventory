# Loom walkthrough script: 30-minute version

An extended walkthrough of about 30 minutes. The assessment asks for "approximately 5 to 10
minutes"; the shorter version is [LOOM_SCRIPT.md](LOOM_SCRIPT.md). Use this one if a longer,
deeper walkthrough was requested. Sections 5 to 9 can also be recorded as separate videos.

Lines in *italics* are suggested wording. Say them in your own words; the assessment asks
for your reasoning, not a reading.

Live app: https://dealerdesk.aneeq02025.workers.dev · password for every account `Dealer#2026`

| Account | Role | Use in the video |
|---|---|---|
| `alice.admin@northside.test` | Admin, Northside | Main user |
| `bob.admin@northside.test` | Admin, Northside | Second admin for the conflict |
| `victor.viewer@northside.test` | Viewer, Northside | Read-only view |
| `sara.admin@southgate.test` | Admin, Southgate | Other dealership |

---

## Before recording (15 minutes)

1. **Reset the demo data.** In GitHub, go to **Actions**, then **CI/CD**, then **Run workflow**.
   Choose `main`, keep **deploy** ticked, and tick **reset_demo_data**. Wait for the green
   run, about 6 minutes. Afterwards every vehicle is at version 1 except **Ford F-150
   (N-1003)**, which shows version 3 by Alice Morgan: the pipeline's own smoke test edits and
   restores it. That is useful evidence to point at in section 6.
2. **Start Docker Desktop and the local database** for the terminal demos in section 8:
   `docker compose up -d` from the repo root.
3. **Open these tabs, left to right:**

   | # | Tab |
   |---|---|
   | 1 | The assessment PDF |
   | 2 | `docs/DealerDesk-System-Design.pdf` |
   | 3 | Live app, signed out |
   | 4 | Live app, second tab |
   | 5 | Cloudflare: Workers & Pages → **dealerdesk** → **Observability** → **Live** |
   | 6 | Neon: Dealership Inventory → **SQL Editor**, with `docs/demo_queries.sql` pasted |
   | 7 | Code editor with the repository open |
   | 8 | Terminal in `backend/`; a second terminal in `frontend/` |
   | 9 | GitHub: the repository, its **Actions** tab, and PR #2 |

4. **Keep off screen:** GitHub secret values, Cloudflare tokens, Neon passwords, and the
   `cf` block inside an expanded Cloudflare log event, which shows your location.
5. **Loom settings:** Screen + Camera, full screen, 1080p, notifications off. Do a 10-second
   test recording.

---

## 0 · Introduction (1:00)

*"This is DealerDesk, a dealership inventory app built for the full-stack assessment. In
the next half hour I'll cover what was asked, the design at a high and a low level, a live
demo with the Cloudflare logs and the database, the code, the QA strategy including a
regression test that catches a real concurrency bug, and the CI/CD pipeline that deploys it."*

Show the README's top table: live URL, repository, red and green runs.

---

## 1 · What was asked (1:30) · tab 1

Scroll the assessment PDF and summarise:

- **The app:** two dealerships, admins edit, viewers read, all inside their own dealership.
- **The core constraint:** *"Every protected call must authenticate, check the role and scope
  to the dealership, using trusted context. And an authorized stale edit must never overwrite
  a newer one, using an atomic check-and-write."*
- **What's weighted most:** *"Backend correctness, practical CI/CD, and QA that covers
  failure scenarios. Visual polish weighs less."*
- **The fixed choices:** Python backend, Cloudflare free plan, GitHub Actions.

---

## 2 · High-level vs low-level design (1:00) · tab 2

Open the PDF on its **Contents** page, which shows Part 1 and Part 2.

- *"Part 1 is the high-level design: the outside view, the major parts, where they run, how
  they connect."*
- *"Part 2 is the low-level design: it opens each part, starting with the data model, then
  the modules, every check on a request, and the error codes."*
- *"The flowcharts use standard symbols: ovals start and end, diamonds are decisions,
  parallelograms are input and output, cylinders are the database, and lettered circles
  continue the flow in the next column."*

---

## 3 · High-level design (3:00) · tab 2

| Figure | Talking points |
|---|---|
| **1 · System context** | Admins and viewers use the app; developers push to GitHub; GitHub deploys to Cloudflare; data lives in Neon. |
| **2 · Deployment** | *"One Cloudflare address serves both halves. The Next.js frontend is plain static files. The FastAPI backend is a Python Worker that only runs for /api. It reaches Postgres through Hyperdrive, which keeps pooled connections near Neon, with caching off so reads are never stale."* |
| **3 · Routing** | *"Pages never run code, so they cost no CPU. Only API calls run Python."* |
| **4 · User journey** | Login, inventory, then admin vs viewer, then save or conflict. *"The conflict loops back to editing; it never overwrites."* |
| **5 · CI/CD pipeline** (landscape) | Follow the connectors A to D. *"Checks on every PR. Deploy only from main, only when all four checks pass. Configuration and token are checked before the first step that changes anything."* |

---

## 4 · Low-level design (4:00) · tab 2

| Figure | Talking points |
|---|---|
| **6 · Data model** | Start here: *"Four tables. Users and vehicles each require exactly one dealership, so isolation is built into the schema. Sessions make logout real. The version column is the optimistic lock."* Show the constraints table under the figure. |
| **7 · Backend layers** | *"Routes parse input, deps.py enforces security, services decide outcomes, repositories hold every SQL statement, core holds shared tools. The Cloudflare entry file swaps only how connections and settings are obtained."* |
| **8 · Login** | *"Unknown email and wrong password give the same error and take the same time, so attackers can't discover accounts. A login creates a session row; the token carries its id."* |
| **9 · Token validation** (landscape) | Walk the three columns: token, session, role. *"Each failure has its own 401 code. Logout works because the session row is checked on every request, not just the token."* |
| **10 · Vehicle update** | *"One UPDATE with the version in the WHERE clause. One row: success. Zero rows: we look again inside your dealership. If it exists you get 409; if not, 404, the same answer as a missing id, so you can't probe other dealerships."* |
| **11 · Concurrency** | *"Both admins send version 1. Postgres serialises the two UPDATEs on the row lock; the second re-checks its WHERE against the committed row, sees version 2, and matches nothing."* |
| **API and error tables** | One error envelope; the frontend switches on the code. |

---

## 5 · Live demo with Cloudflare logs (5:00) · tabs 3, 4, 5

Put the app and Cloudflare **Live** side by side. Call out each log line as it appears.

1. **Login as Alice.** Log shows `POST /api/auth/login`. *"Inventory shows four Northside cars, nothing from Southgate."* Use the search box and a status filter.
2. **Open the Toyota Camry.** It shows version 1.
3. **Tab 4: sign in as Bob**, open the same Camry, also version 1.
4. **Alice changes the model and saves.** It shows version 2; the log shows `PUT` with 200.
5. **Bob changes the status and saves.** The log shows `PUT` with **409**. *"Bob's save was rejected, not merged and not overwritten. The panel says Alice saved first, shows his edit next to the saved values, and Save is disabled until he refreshes."*
6. **Bob clicks Refresh to latest version**, re-applies, and saves as version 3.
7. **Reload Alice's page:** both changes persisted.
8. **Click a `PUT` event** in the log and show `status` and `cpuTimeMs`. Scroll past `cf`.
9. **Cross-dealership by URL:** as Alice, open `/vehicles/edit/?id=d2222222-0000-4000-8000-000000000001`, Southgate's Malibu. It shows "Vehicle not found". *"The API returns 404, the same as a car that doesn't exist."*
10. **Sign out Bob, then sign in as Victor.** Read-only notice; **View** instead of Edit; the form is disabled.
11. **Session invalidation:** sign out Victor. *"Logout revoked the session on the server; I'll show the row in the database next."*

---

## 6 · Database in Neon (2:00) · tab 6

Run the queries from `docs/demo_queries.sql`:

1. **Query 1, inventory.** *"Camry is version 3, last updated by Bob: Alice took it to 2, Bob to 3. The rejected 409 left no trace. The Ford F-150 is at version 3 by Alice: that's the deploy pipeline's smoke test, which edits a car and restores it after every release."*
2. **Query 3, sessions.** Bob's and Victor's rows have `revoked` filled in.
3. **Query 2, users.** One dealership each; passwords only as PBKDF2 hashes, all different.
4. **Query 4, isolation.** Four vehicles per dealership.
5. **Query 5, migrations.** *"Applied by the pipeline, forward-only."*

---

## 7 · Code walkthrough (4:00) · tab 7

| File | Lines | Point |
|---|---|---|
| Repository root | | Folder tour: `backend/`, `frontend/`, `cloudflare/`, `.github/workflows/`, `docs/` |
| `backend/app/api/deps.py` | 41–77 | `current_user`: the three checks; role and dealership from the database row |
| same | 80–85 | `require_admin`: 403 before any SQL |
| `backend/app/schemas/vehicle.py` | | `extra="forbid"`: a client can't even send `dealership_id` |
| `backend/app/repositories/vehicles.py` | 33–72 | The atomic UPDATE; every query filters by `dealership_id` |
| `backend/app/services/vehicles.py` | 31–60 | Zero rows: 409 vs 404 |
| `backend/app/core/security.py` | | PBKDF2 per-user salt; WebCrypto on Cloudflare, hashlib locally |
| `cloudflare/src/entry.py` | 88–90 | Three dependency overrides; nothing else changes on Cloudflare |
| `frontend/lib/api.ts` | 96 | Every failure becomes a typed error; 401 signs you out with a reason |
| `frontend/app/vehicles/edit/page.tsx` | 242 | Sends the version the form loaded; `ConflictPanel` |

---

## 8 · QA: failed and passed (4:30) · tabs 8, 9

**The strategy (30 s):** *"Five layers. API tests against a real Postgres, never mocks,
because the behaviour lives in SQL. A check of the Cloudflare hashing code inside Pyodide.
Browser tests with Playwright. A smoke test against the live site. And a live race test."*

**a. Run the backend suite** in the `backend/` terminal:

```bash
.venv/Scripts/python -m pytest -v
```

55 passed. Scroll to `test_viewer_cannot_update` and `test_cannot_update_other_dealership_vehicle`:
*"Every rejected write also reads the row back and asserts it is unchanged."*

**b. The regression test, red then green.**
1. Open PR #2 and its two commits: `de5c4fc` (test only) and `6dc1a40` (fix).
2. Open the **red run** and its log: `got [200, 200]: a stale edit was accepted (lost update)`.
3. Open the **green run**.
4. Open `backend/tests/test_concurrency.py`: the barrier at line 52 makes both requests read
   before either writes, so the old code fails every time, not by luck.

**c. Reproduce it live:**

```bash
git checkout de5c4fc -- app/repositories/vehicles.py
.venv/Scripts/python -m pytest tests/test_concurrency.py -q
git checkout HEAD -- app/repositories/vehicles.py
.venv/Scripts/python -m pytest tests/test_concurrency.py -q
```

The first run fails with `[200, 200]`; the second passes.

**d. Browser tests, visible.** In the `frontend/` terminal:

```bash
npm run test:e2e -- --headed
```

Chromium opens and runs the 7 tests: login, edit, reload, conflict between two browsers,
viewer, invalid session, revoked session.

**e. Against production, bypassing the UI:**

```bash
.venv/Scripts/python scripts/smoke.py https://dealerdesk.aneeq02025.workers.dev
.venv/Scripts/python scripts/live_race.py https://dealerdesk.aneeq02025.workers.dev
```

*"Direct API calls: viewer 403, other dealership 404, stale edit 409, logout revocation. Then
five rounds of truly simultaneous saves: one success and one conflict every time."*

---

## 9 · CI/CD and operations (3:00) · tabs 7, 9

1. **`.github/workflows/ci.yml`.** Show the triggers (pull request, push to main, manual with
   three options), the four check jobs, and the deploy job's `needs` and `if` (lines 214–220).
2. **The deploy steps** in order: config check, token check (line 257), build, migrate, seed
   if empty, bundle, deploy, secret, health wait, smoke.
3. **Actions tab:** open the latest green run; show the job graph and the smoke output.
4. **The README's "First deployment" table:** *"Four failed runs, each stopped at the first
   gate that could detect the problem. No broken release and no half-migrated database."*
5. **Settings → Secrets and variables → Actions:** the names only. *"Credentials live in
   GitHub, never in the code."*
6. **Health:** open `/api/health` in the browser. It shows the deployed commit.
7. **Recovery:** *"Run the workflow manually with an older commit to roll back through the
   same gates, or `wrangler rollback` for an instant revert. Migrations are forward-only and
   additive, so rolling back code never requires rolling back the schema."*

---

## 10 · Tradeoffs, gaps, next steps (1:00)

- **Python on the Workers free plan.** *"Measured CPU per request is 25 to 130 ms median
  against a documented 10 ms. Every request succeeded, but under real load the fix is
  Workers Paid at $5 a month."*
- **Password hashing.** 10,000 PBKDF2 iterations on Cloudflare vs 600,000 locally; the
  measurements show hashing isn't the main CPU cost, so it can go back up.
- **Token in sessionStorage.** *"Next step is httpOnly cookies, now that production is one origin."*
- **No rate limiting on login,** and no rehearsed live rollback.
- **Close:** *"Everything shown is deployed and verified; the gaps are listed in the README's
  known limitations."*

---

## Timing

| Section | Minutes |
|---|---|
| 0 Introduction | 1:00 |
| 1 What was asked | 1:30 |
| 2 HLD vs LLD | 1:00 |
| 3 High-level design | 3:00 |
| 4 Low-level design | 4:00 |
| 5 Live demo + logs | 5:00 |
| 6 Database | 2:00 |
| 7 Code | 4:00 |
| 8 QA | 4:30 |
| 9 CI/CD | 3:00 |
| 10 Wrap-up | 1:00 |
| **Total** | **about 30:00** |

If you run long, shorten sections 3 and 4 first: the diagrams are also in the PDF for reviewers.
