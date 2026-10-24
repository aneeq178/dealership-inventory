# Work log

What was built, where it lives, how it was done and verified, in order. Deployment was
deliberately left for later.

## 0. Environment

| What | How |
|---|---|
| Python | Your existing Python 3.12 with a project virtualenv at `backend/.venv` (plain `venv` + `pip`). CI uses 3.13 because Cloudflare Python Workers require it. |
| Node | Your existing Node 20. |
| Postgres | `docker-compose.yml` runs `postgres:16-alpine` on port 5432 with user and password `dealer`. Dev data lives in database `dealership`, tests in `dealership_test`. |
| Docker repair | Docker Desktop failed to start because of leftover Unix socket files from an earlier force-stop. Windows refused to delete them, so these two folders were renamed aside: `%LOCALAPPDATA%\Docker\run` became `run.stale-20261024`, then `run.stale2-20261024`, and `%LOCALAPPDATA%\docker-secrets-engine` became `docker-secrets-engine.stale-20261024`. Docker recreated fresh ones. The renamed folders can be deleted after a reboot. |
| Playwright | `@playwright/test` 1.64 and the Chromium headless shell, in `%LOCALAPPDATA%\ms-playwright`. |
| GitHub | Private repo `aneeq178/dealership-inventory`, created with your logged-in `gh` CLI. |
| Browser preview config | `.claude/launch.json`, ignored by git. Starts the API on :8000 and `next dev` on :3000. |

## 1. Repository scaffold → commit `c2af72d` on main

- `.gitignore`, `.gitattributes` (LF line endings), `docker-compose.yml`, `README.md` stub,
  `docs/PLAN.md`.

## 2. Backend core → PR #1, merged as `f615084`

Branch `feat/backend-core`, three commits, each passing its own tests:

| Commit | Contents |
|---|---|
| `e9a4a52` | `.github/workflows/ci.yml` backend job: ruff, mypy, migrate and seed, pytest against a Postgres service container |
| `0a40360` | Schema and auth. `migrations/001_init.sql`; `scripts/migrate.py`, `seed.py`, `reset.py`; `app/core/` (config, db, errors, security); `app/api/deps.py` (current_user, require_admin); auth routes; health route; `tests/test_auth.py`, `test_health.py` |
| `309eed5` | Vehicles: repository, service, routes, schemas; **deliberately naive** read-then-write update; `tests/test_access.py`, `test_vehicles.py` |

How the pieces fit:
- **Schema** (`backend/migrations/001_init.sql`). The tables are dealerships, users, sessions
  and vehicles. Check constraints limit role, status, year and name lengths. Vehicles carry
  `version` and `updated_by`.
- **Seed** (`backend/scripts/seed.py`). Fixed UUIDs give 2 dealerships, 6 users and 8 vehicles.
  It truncates and reinserts, so it is repeatable.
- **Security** (`backend/app/core/security.py`). PBKDF2-SHA256 hashes in the format
  `pbkdf2_sha256$iterations$salt$hash`, plus HS256 JWTs carrying `sub` and `sid`.
- **Auth dependency** (`backend/app/api/deps.py`). It checks the bearer token, then the JWT,
  then the session row, and raises 401 with a specific code for each failure.
- **Errors** (`backend/app/core/errors.py`). Typed exceptions map to one JSON envelope.

Verified with 43 tests locally, ruff and mypy clean, then CI green on PR #1.

Hardening done during this step: the JWT secret must be at least 32 characters, because PyJWT
warned about short HMAC keys. The settings class rejects shorter secrets.

## 3. Lost-update fix → PR #2, merged as `a201c63`

| Commit | Contents | CI |
|---|---|---|
| `de5c4fc` | `backend/tests/test_concurrency.py` only | **Red**, [run 40089597027](https://github.com/aneeq178/dealership-inventory/actions/runs/40089597027): `got [200, 200]: a stale edit was accepted (lost update)` |
| `6dc1a40` | `backend/app/repositories/vehicles.py`: atomic conditional `UPDATE ... WHERE version = $expected RETURNING` | **Green**, [run 40089805129](https://github.com/aneeq178/dealership-inventory/actions/runs/40089805129): 45 passed |

How: the naive repository awaited `after_read_hook` between its read and its write. The test
installs an `asyncio.Barrier(2)` there, so both requests read version 1 before either writes.
The fix removes the read step, and the hook with it.

Verified locally, 25 runs each: the naive version failed 25 of 25 and the fix passed 25 of 25.
I waited for the red run to finish before pushing the fix, because CI cancels superseded runs.
I merged with a merge commit, not a squash, so `de5c4fc` stays in `main`.

## 4. Frontend, E2E and CI → PR #3, branch `feat/frontend`

| Commit | Contents |
|---|---|
| `34ecb66` | Backend test infrastructure: isolated `dealership_test` DB created on demand; tests pin all settings; `STATIC_DIR` serves the built frontend; settings read `backend/.env` from any working directory |
| `4b99d42` | Next.js 16 frontend in `frontend/` |
| `e0aa574` | Playwright config and specs, CI `frontend` and `e2e` jobs, README screenshots |

Frontend layout:
- `frontend/next.config.ts` sets `output: "export"` and `trailingSlash`, and turns off
  `cacheComponents`. I read Next 16's bundled docs in `node_modules/next/dist/docs` first,
  because the template's AGENTS.md warns that the APIs changed.
- `frontend/lib/api.ts` is the only HTTP client. It maps every failure to `ApiError` with a code.
- `frontend/lib/session.ts` keeps the token in sessionStorage.
- `frontend/components/auth-provider.tsx` holds the user state, login, logout, the handler that
  runs on any 401, and the signed-out reason.
- `frontend/components/app-shell.tsx` provides the header and route guard. It is the only
  redirect to `/login`.
- `frontend/components/ui.tsx` contains Button, badges, Alert, Field, Input, Select, Card and
  Skeleton.
- `frontend/app/login/page.tsx` has the split layout, reason banners, errors and one-click demo
  accounts.
- `frontend/app/vehicles/page.tsx` has status cards, search, filters, a table on desktop and
  cards on mobile, and loading, empty and error states.
- `frontend/app/vehicles/edit/page.tsx` has the form with the loaded version, the conflict panel
  and its comparison, required refresh, and forbidden, not-found, validation and network
  states. Viewers get a read-only view.

Problems found and fixed while building:

| Found by | Problem | Fix |
|---|---|---|
| `next build` | Type error from `cn(title && ...)` | Use a ternary |
| ESLint, React 19 hooks rule | Three effects set state synchronously | Effects now only start requests; state is set when they resolve |
| **Playwright** | After logout or an invalid session, the login page lost the reason message. Two redirects raced: the provider's and the route guard's. | The provider records `signedOutReason`; only the route guard redirects |
| Screenshot review | Dark outlines on the selected demo account and Edit buttons, because brand-200 and brand-300 colours were undefined | Defined the missing colour shades |
| Screenshot review | Button labels wrapped; the role badge showed on mobile | `whitespace-nowrap`; wrapper span for the badge |
| **CI, first E2E run on PR #3** | All 7 E2E tests failed in CI but passed locally. The per-test reseed only passed the database URL. Locally it silently read `JWT_SECRET` from `backend/.env`, which CI does not have, so settings validation failed. The error was hidden because the output was discarded. | One complete `BACKEND_ENV` in `e2e/env.ts`, shared by the server and the reseed. The reseed now reports stderr on failure. Verified by running E2E locally with `backend/.env` moved aside. |

E2E: 7 tests passed in three consecutive runs. They run FastAPI serving `frontend/out` on one
origin against a freshly reset test database, reseeded before each test.

## 5. Smoke test

`backend/scripts/smoke.py` uses only the standard library. It checks health, login, missing
token, scoped list, allowed update and persistence, viewer edit rejected, cross-dealership
read and update rejected, stale edit getting 409, data restored, and logout revocation.
It passed 15 of 15 against `http://localhost:8000`.

## 6. Documentation

- `README.md` covers the deliverables: setup, env vars, commands, accounts, the regression
  demo with links, conflict reproduction, CI, the deployment plan, recovery, and limitations.
- `docs/DECISIONS.md` lists the tradeoffs to defend in the Loom.
- `docs/WORKLOG.md` is this file.
- `docs/screenshots/` holds six screenshots, regenerated with
  `SCREENSHOTS=1 npx playwright test screenshots`.

## 7. Cloudflare deployment pipeline → PR #4, branch `feat/cloudflare-deploy`

| Area | Change | Verified by |
|---|---|---|
| App factory | `create_app(AppOptions)`, nothing read at import; uvicorn uses `--factory` | 54 pytest, 7 E2E |
| Password hashing | Async verify; WebCrypto PBKDF2 when running under Pyodide, `hashlib` otherwise | RFC 7914 vector in pytest; `cloudflare/tests/webcrypto_parity.mjs` under Pyodide 314.0.7 |
| Seed | `--if-empty` mode for deploys | Ran both modes locally |
| Worker | `cloudflare/src/entry.py`: Hyperdrive connection per request, settings from `env` | `backend/tests/test_worker_entry.py` with a stub runtime and a fake Hyperdrive binding |
| Config | `cloudflare/wrangler.template.json`, `configure.py`, `pyproject.toml` | CI renders a test config |
| CI/CD | Manual trigger with `ref`, `deploy`, `reset_demo_data`; new `worker` job; gated `deploy` job | YAML parsed; deploy not run yet |

Measured native PBKDF2 at about 0.6 µs per iteration, which led to a default of 10,000
iterations on Cloudflare.

## 8. First deployment → PRs #5, #6, #7, live

Accounts and secrets were created by the repository owner; I read the dashboards, saved the
two non-secret values (Account ID, Hyperdrive ID), deleted a Hyperdrive config at the owner's
request, and fixed each pipeline failure:

| Problem | Found by | Fix |
|---|---|---|
| Hyperdrive created with Neon's pooled host | Reading the Hyperdrive list | Recreated on the direct host, caching off |
| Two secrets empty | Deploy config check | Re-saved from the clipboard |
| pywrangler ignores `wrangler.json` | Deploy log | PR #5: `wrangler.jsonc`, `pipefail` |
| Token rejected (9106, then 6003) | Deploy log, then the new token check | PR #6 check; token re-saved via GitHub's page |
| Cloudflare blocks `Python-urllib` (1010) | Smoke step vs. curl | PR #7: explicit user agent |

Green run: [40104512958](https://github.com/aneeq178/dealership-inventory/actions/runs/40104512958). Live at https://dealerdesk.aneeq02025.workers.dev:
health ok, smoke 15/15, `scripts/live_race.py` 5/5 (added in this step).

## Not done (next steps)

1. **Rotate the Cloudflare API token.** Its value appeared in a screenshot during setup.
   Roll it and update `CLOUDFLARE_API_TOKEN` through GitHub's secrets page.
2. **Read exact CPU time per request** from Cloudflare's dashboard and note it in the README.
3. **Repo visibility.** Make it public, or invite reviewers. Branch protection that requires the
   three checks is only enforced on public repos with a free GitHub plan.
4. **Loom.** Record it, then add the link to the README.
