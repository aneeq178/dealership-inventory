# Architecture

High-level views first, then the low-level request, auth, concurrency and data views.
Diagrams are Mermaid, so GitHub renders them in place. PNG copies for slides or video are in
[docs/diagrams/](diagrams/).

---

## High level

### 1. System overview

```mermaid
flowchart LR
    user(["Browser<br/>admin or viewer"])

    subgraph CF["Cloudflare · free plan · dealerdesk.aneeq02025.workers.dev"]
        direction TB
        assets["Static assets<br/>Next.js export<br/>login · inventory · edit"]
        worker["Python Worker<br/>FastAPI app<br/>/api/*"]
        hyper["Hyperdrive<br/>connection pool<br/>caching off"]
    end

    subgraph NEON["Neon · AWS us-east-2"]
        pg[("PostgreSQL<br/>dealerships · users<br/>sessions · vehicles")]
    end

    subgraph GH["GitHub"]
        repo["Repository<br/>main + PRs"]
        ci["Actions CI/CD<br/>checks → gated deploy"]
    end

    user -- "pages, JS, CSS" --> assets
    user -- "JSON + Bearer token" --> worker
    worker -- "asyncpg, one conn per request" --> hyper
    hyper -- "pooled TLS connections" --> pg
    repo --> ci
    ci -- "pywrangler deploy" --> CF
    ci -- "migrations + seed" --> pg
```

One origin serves both the pages and the API, so the browser never makes a cross-origin
call. Only `/api/*` runs Python; every page is a static file.

### 2. Delivery pipeline

```mermaid
flowchart LR
    subgraph triggers["Triggers"]
        direction TB
        pr["Pull request"]
        push["Push to main"]
        manual["Manual run<br/>ref · deploy<br/>reset_demo_data"]
    end

    subgraph checks["Checks · in parallel"]
        direction TB
        be["Backend<br/>ruff · mypy<br/>55 pytest vs Postgres"]
        fe["Frontend<br/>eslint · tsc · build"]
        wk["Worker<br/>WebCrypto under Pyodide"]
    end

    e2e["E2E<br/>7 Playwright tests<br/>API + built UI"]
    stop(["No deploy"])

    subgraph prep["Deploy · preflight + data"]
        direction TB
        c1["1 · Config present?"] --> c2["2 · Token valid?<br/>asks Cloudflare"]
        c2 --> c3["3 · Build frontend"] --> c4["4 · Migrate Neon"]
        c4 --> c5["5 · Seed if empty"]
    end

    subgraph release["Deploy · release + verify"]
        direction TB
        c6["6 · Bundle API<br/>render wrangler.jsonc"] --> c7["7 · pywrangler deploy"]
        c7 --> c8["8 · Set JWT_SECRET"] --> c9["9 · Health shows<br/>new SHA"]
        c9 --> c10["10 · Smoke test<br/>15 checks"]
    end

    live(["Live"])

    triggers --> checks --> e2e
    e2e -->|"any failure,<br/>or a PR"| stop
    e2e -->|"all green<br/>AND main"| prep
    prep --> release --> live
```

Every step fails the job on error, and the steps that can fail cheaply (configuration,
token) run before the first one that changes anything (migration).

### 3. Request routing at the edge

```mermaid
flowchart LR
    req["Incoming request"] --> api{"Path starts<br/>with /api/ ?"}
    api -->|yes| py["Python Worker<br/>FastAPI"]
    api -->|no| file{"Static file<br/>exists?"}
    file -->|yes| serve["Serve HTML/JS/CSS<br/>no Worker CPU"]
    file -->|no| nf["404 page"]
```

---

## Low level

### 4. Backend layers

```mermaid
flowchart TB
    subgraph api["app/api · HTTP"]
        routes["routes/<br/>auth.py · vehicles.py · health.py"]
        deps["deps.py<br/>current_user · require_admin"]
    end
    subgraph svc["app/services · use cases"]
        authsvc["auth.py<br/>login"]
        vehsvc["vehicles.py<br/>list · get · update<br/>decides 409 vs 404"]
    end
    subgraph repo["app/repositories · all SQL"]
        users["users.py"]
        sessions["sessions.py"]
        vehicles["vehicles.py<br/>atomic conditional UPDATE"]
    end
    subgraph core["app/core"]
        config["config.py<br/>Settings"]
        security["security.py<br/>PBKDF2 · JWT"]
        errors["errors.py<br/>JSON error envelope"]
        db["db.py<br/>get_conn · db_ping"]
    end

    routes --> deps
    routes --> authsvc & vehsvc
    deps --> users & security
    authsvc --> users & sessions & security
    vehsvc --> vehicles
    users & sessions & vehicles --> db

    db -.->|"local / CI"| pool["asyncpg pool<br/>in app lifespan"]
    db -.->|"Cloudflare<br/>entry.py override"| hd["Hyperdrive binding<br/>per request"]
```

`cloudflare/src/entry.py` reuses this app unchanged and overrides three dependencies:
`get_conn`, `db_ping`, and `get_settings`.

### 5. Login, authenticated request, logout

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant W as Worker · FastAPI
    participant DB as Postgres

    B->>W: POST /api/auth/login {email, password}
    W->>DB: SELECT user by lower(email)
    W->>W: PBKDF2 verify (WebCrypto)<br/>dummy check if email unknown
    W->>DB: INSERT sessions (expires_at = now + 30 min)
    W-->>B: 200 {access_token: JWT(sub, sid, exp), user}

    B->>W: GET /api/vehicles · Authorization: Bearer JWT
    W->>W: verify signature + exp
    W->>DB: SELECT session JOIN user WHERE sid, sub
    alt missing / bad / expired / revoked
        W-->>B: 401 unauthenticated · invalid_token · token_expired · token_revoked
    else valid
        W->>DB: SELECT vehicles WHERE dealership_id = user's
        W-->>B: 200 {items}
    end

    B->>W: POST /api/auth/logout
    W->>DB: UPDATE sessions SET revoked_at = now()
    W-->>B: 204
    Note over B,W: Same token now gets 401 token_revoked,<br/>even before its JWT exp
```

### 6. Authorization decision for an update

```mermaid
flowchart TB
    put["PUT /api/vehicles/{id}<br/>{make, model, year, status, version}"] --> auth{"current_user<br/>token + session valid?"}
    auth -->|no| r401["401"]
    auth -->|yes| role{"require_admin<br/>role = admin?"}
    role -->|no| r403["403 forbidden<br/>no SQL runs"]
    role -->|yes| body{"Body valid?<br/>extra fields rejected"}
    body -->|no| r422["422 validation_error"]
    body -->|yes| upd["UPDATE ... WHERE id AND dealership_id<br/>AND version = sent version"]
    upd -->|"1 row"| r200["200 + new version"]
    upd -->|"0 rows"| look{"Vehicle exists in<br/>caller's dealership?"}
    look -->|yes| r409["409 version_conflict<br/>+ current record"]
    look -->|no| r404["404 not_found<br/>other dealership looks<br/>identical to missing"]
```

Dealership and role always come from the session's database row, never from the request.

### 7. Two admins save the same version at once

```mermaid
sequenceDiagram
    autonumber
    participant A as Alice
    participant Bo as Bob
    participant W as Worker
    participant PG as Postgres

    A->>W: GET vehicle → version 1
    Bo->>W: GET vehicle → version 1
    par same instant
        A->>W: PUT {model: "LE", version: 1}
    and
        Bo->>W: PUT {model: "SE", version: 1}
    end
    W->>PG: UPDATE ... WHERE version = 1 (Alice)
    Note over PG: takes the row lock
    W->>PG: UPDATE ... WHERE version = 1 (Bob)
    Note over PG: waits for the lock
    PG-->>W: Alice: 1 row, version → 2
    W-->>A: 200 (version 2)
    Note over PG: lock released · Bob's WHERE<br/>re-checked: version is now 2
    PG-->>W: Bob: 0 rows
    W->>PG: SELECT current (still exists)
    W-->>Bo: 409 version_conflict + Alice's record
    Note over Bo: UI disables Save,<br/>shows the diff and "Refresh to latest version"
```

The check and the write are one statement, so there is no gap between them. The defective
version (`309eed5`) read the version, compared it in Python, then wrote unconditionally. Both
requests passed the check and both wrote.

### 8. Frontend failure handling

```mermaid
flowchart LR
    call["lib/api.ts<br/>request()"] --> st{"Response"}
    st -->|2xx| ok["Return data"]
    st -->|401| out["Clear token<br/>AuthProvider records reason<br/>AppShell → /login?reason=…"]
    st -->|403| fb["Forbidden banner"]
    st -->|404| nf["Not found in your dealership"]
    st -->|409| cf["Conflict panel<br/>diff + Refresh, Save disabled"]
    st -->|422| fe["Field errors"]
    st -->|"network / 5xx"| ne["Retryable error"]
```

### 9. Data model

```mermaid
erDiagram
    DEALERSHIPS ||--o{ USERS : employs
    DEALERSHIPS ||--o{ VEHICLES : owns
    USERS ||--o{ SESSIONS : "logs in"
    USERS |o--o{ VEHICLES : "last updated"

    DEALERSHIPS {
        uuid id PK
        text name UK
    }
    USERS {
        uuid id PK
        uuid dealership_id FK
        text email UK "case-insensitive"
        text role "admin or viewer"
        text password_hash "pbkdf2_sha256$iter$salt$hash"
    }
    SESSIONS {
        uuid id PK
        uuid user_id FK
        timestamptz expires_at
        timestamptz revoked_at "set on logout"
    }
    VEHICLES {
        uuid id PK
        uuid dealership_id FK
        text stock_number
        text make
        text model
        int year "1900-2100"
        text status "available reserved sold"
        int version "optimistic lock"
        uuid updated_by FK
    }
```
