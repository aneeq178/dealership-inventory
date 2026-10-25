# DealerDesk System Design

**High-level and low-level design of the dealership inventory application**

Live: https://dealerdesk.aneeq02025.workers.dev · Repository: https://github.com/aneeq178/dealership-inventory

This document is the source of the PDF `docs/DealerDesk-System-Design.pdf`, which is built
by `docs/tools/build_design_pdf.cjs`. PNG copies of every figure, for slides and video, are
in [docs/diagrams/](diagrams/).

---

## How to read this document

### What high-level design means

**High-level design (HLD)** describes the system from the outside. It answers:

- **What are the major parts?** For example: a web frontend, an API, a database, a delivery pipeline.
- **Where does each part run?** For example: Cloudflare, Neon, GitHub.
- **How do the parts talk to each other?** Which protocols, and in which direction.
- **Who uses the system, and for what?**

HLD deliberately leaves out function names, SQL and field types. Its audience is anyone who
needs the big picture: reviewers, stakeholders, a new team member on day one.

### What low-level design means

**Low-level design (LLD)** opens each box from the HLD and describes how it works inside. It
answers:

- **How is the code organised?** Modules, layers, and their responsibilities.
- **Exactly what happens, step by step,** when a request arrives: every check, every
  decision, every database call.
- **What are the data structures?** Tables, columns, constraints, API contracts and error codes.
- **How are the hard cases handled?** Invalid tokens, wrong roles, other dealerships'
  data, two people saving at once.

Its audience is the engineers who build, review and maintain the code.

| | High-level design | Low-level design |
|---|---|---|
| Question | What are the parts and how do they connect? | How does each part work inside? |
| Detail | Systems, services, hosting, data flow | Modules, functions, SQL, fields, error codes |
| Typical diagrams | Context, deployment, user journey, pipeline | Flowcharts of logic, sequence diagrams, ERD, API tables |
| Changes when | The architecture changes | The code changes |
| In this document | Part 1, figures 1–6 | Part 2, figures 7–15 |

### Flowchart symbols

Flowcharts use the standard symbols (ISO 5807 / ANSI style), colour-coded for readability.

#### Figure 1 · Flowchart symbol legend

```mermaid
flowchart LR
    t(["Terminator<br/>start or end"]):::term
    p["Process<br/>one step of work"]
    d{"Decision<br/>yes / no"}:::dec
    io[/"Input / output<br/>data in or out"/]:::io
    sub[["Predefined process<br/>a named function"]]:::sub
    db[("Data store<br/>database table")]:::db
    c(("Actor")):::actor
    con(("A")):::con
    x(["Error terminator<br/>request rejected"]):::bad
    t ~~~ p ~~~ d ~~~ io
    sub ~~~ db ~~~ c ~~~ con ~~~ x

    classDef term fill:#dcfce7,stroke:#15803d,color:#14532d
    classDef bad fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d
    classDef dec fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef io fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e
    classDef db fill:#f1f5f9,stroke:#334155,color:#0f172a
    classDef sub fill:#ede9fe,stroke:#6d28d9,color:#3b0764
    classDef actor fill:#fff7ed,stroke:#c2410c,color:#7c2d12
    classDef con fill:#ffffff,stroke:#334155,color:#0f172a,stroke-width:2px
```

| Symbol | Shape | Meaning |
|---|---|---|
| Terminator | Rounded oval | Where a flow starts or ends. Red ovals end a flow with an error response. |
| Process | Rectangle | One step of work |
| Decision | Diamond | A yes/no question; each exit is labelled |
| Input / output | Parallelogram | Data entering or leaving: user input, an HTTP response |
| Predefined process | Rectangle with double sides | A named function described elsewhere |
| Data store | Cylinder | A database read or write |
| Actor | Circle with a name | A person or external system |
| On-page connector | Circle with a letter | The flow continues at the circle with the same letter. Long flowcharts are split into numbered columns this way. |

---

## Part 1 · High-level design

### 1.1 System context

Who uses DealerDesk, and which outside systems it depends on.

#### Figure 2 · System context

```mermaid
flowchart LR
    admin(("Administrator")):::actor
    viewer(("Viewer")):::actor
    dev(("Developer")):::actor

    sys["DealerDesk<br/>dealership inventory app"]

    cf["Cloudflare<br/>hosting and edge network"]
    neon[("Neon<br/>managed PostgreSQL")]:::db
    gh["GitHub<br/>repository and Actions CI/CD"]

    admin -- "views and edits own<br/>dealership's vehicles" --> sys
    viewer -- "views own<br/>dealership's vehicles" --> sys
    dev -- "pushes code,<br/>opens pull requests" --> gh
    gh -- "tests, then deploys" --> cf
    sys -- "runs on" --> cf
    sys -- "stores data in" --> neon

    classDef db fill:#f1f5f9,stroke:#334155,color:#0f172a
    classDef actor fill:#fff7ed,stroke:#c2410c,color:#7c2d12
```

Two dealerships, Northside Motors and Southgate Auto Group, each have two administrators and
one viewer. Every user belongs to exactly one dealership and only ever sees that
dealership's vehicles.

### 1.2 Deployment architecture

Where each part runs in production, and what flows between them.

#### Figure 3 · Deployment architecture

```mermaid
flowchart TB
    user(("Browser")):::actor

    subgraph CF["Cloudflare · free plan · dealerdesk.aneeq02025.workers.dev"]
        assets[/"Static assets<br/>Next.js export"/]:::io
        worker[["Python Worker<br/>FastAPI, /api/* only"]]:::sub
        hyper[["Hyperdrive<br/>pool, caching off"]]:::sub
    end

    subgraph NEON["Neon · AWS us-east-2"]
        pg[("PostgreSQL<br/>dealerships · users<br/>sessions · vehicles")]:::db
    end

    subgraph GH["GitHub"]
        repo["Repository"]
        ci[["Actions CI/CD<br/>checks, gated deploy"]]:::sub
    end

    user -- "HTTPS pages" --> assets
    user -- "HTTPS JSON +<br/>Bearer token" --> worker
    worker -- "asyncpg,<br/>per request" --> hyper
    hyper -- "pooled TLS" --> pg
    repo --> ci
    ci -- "deploy Worker<br/>+ assets" --> worker
    ci -- "migrations,<br/>seed" --> pg

    classDef term fill:#dcfce7,stroke:#15803d,color:#14532d
    classDef bad fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d
    classDef dec fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef io fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e
    classDef db fill:#f1f5f9,stroke:#334155,color:#0f172a
    classDef sub fill:#ede9fe,stroke:#6d28d9,color:#3b0764
    classDef actor fill:#fff7ed,stroke:#c2410c,color:#7c2d12
    classDef con fill:#ffffff,stroke:#334155,color:#0f172a,stroke-width:2px
```

| Part | Technology | Why |
|---|---|---|
| Frontend | Next.js 16, static export, Tailwind | All data is per-user and fetched with a token, so plain files suffice and cost no compute |
| API | FastAPI on Cloudflare Python Workers | Python backend required; Cloudflare hosting required |
| Database | PostgreSQL 16 on Neon, through Hyperdrive | Row locking makes the atomic update correct; Hyperdrive pools connections near Neon |
| Delivery | GitHub Actions | Tests on every pull request; deploys only from a green `main` |

### 1.3 Request routing at the edge

Every request reaches Cloudflare first. Only API calls run Python.

#### Figure 4 · Request routing

```mermaid
flowchart TB
    s(["Request arrives at Cloudflare"]):::term
    api{"Path starts<br/>with /api/ ?"}:::dec
    py[["Python Worker<br/>handles the API call"]]:::sub
    file{"Matching static<br/>file exists?"}:::dec
    serve[/"Serve HTML, JS or CSS<br/>no Worker CPU used"/]:::io
    nf[/"Serve the 404 page"/]:::io
    e(["Response sent"]):::term

    s --> api
    api -- Yes --> py --> e
    api -- No --> file
    file -- Yes --> serve --> e
    file -- No --> nf --> e

    classDef term fill:#dcfce7,stroke:#15803d,color:#14532d
    classDef dec fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef io fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e
    classDef sub fill:#ede9fe,stroke:#6d28d9,color:#3b0764
```

### 1.4 Main user journey

The business flow from the user's point of view.

#### Figure 5 · User journey

```mermaid
flowchart TB
    s(["Open DealerDesk"]):::term
    sess{"Valid session<br/>in this tab?"}:::dec
    creds[/"Enter email<br/>and password"/]:::io
    ok{"Credentials<br/>correct?"}:::dec
    bad[/"Incorrect email<br/>or password"/]:::io
    inv[/"Inventory of own dealership.<br/>Select a vehicle"/]:::io
    admin{"Administrator?"}:::dec
    ro(["Read-only details"]):::term
    edit[/"Edit fields, then Save<br/>with the loaded version"/]:::io
    res{"Version still<br/>current?"}:::dec
    done(["Saved: version +1,<br/>change persists"]):::term
    conflict[/"Conflict: refresh<br/>to the latest version"/]:::io

    s --> sess
    sess -- Yes --> inv
    sess -- No --> creds --> ok
    ok -- No --> bad --> creds
    ok -- Yes --> inv
    inv --> admin
    admin -- No --> ro
    admin -- Yes --> edit --> res
    res -- Yes --> done
    res -- No --> conflict --> edit

    classDef term fill:#dcfce7,stroke:#15803d,color:#14532d
    classDef bad fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d
    classDef dec fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef io fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e
    classDef db fill:#f1f5f9,stroke:#334155,color:#0f172a
    classDef sub fill:#ede9fe,stroke:#6d28d9,color:#3b0764
    classDef actor fill:#fff7ed,stroke:#c2410c,color:#7c2d12
    classDef con fill:#ffffff,stroke:#334155,color:#0f172a,stroke-width:2px
```

### 1.5 Delivery pipeline

From a code change to a verified release. Each failure stops the run before anything
further changes.

#### Figure 6 · CI/CD pipeline

```mermaid
flowchart LR
    subgraph A["① Checks · every run"]
        direction TB
        s(["PR, push to main,<br/>or manual run"]):::term
        checks[["Backend · Frontend · Worker<br/>checks in parallel"]]:::sub
        c1{"All pass?"}:::dec
        e2e[["E2E: 7 Playwright tests"]]:::sub
        c2{"Pass?"}:::dec
        fail1(["Run fails.<br/>Nothing deployed"]):::bad
        toB(("B")):::con
        s --> checks --> c1
        c1 -- No --> fail1
        c1 -- Yes --> e2e --> c2
        c2 -- No --> fail1
        c2 -- Yes --> toB
    end
    subgraph B["② Deploy gate"]
        direction TB
        fromB(("B")):::con
        main{"On main?<br/>push or manual"}:::dec
        pr(["Checks only.<br/>Nothing deployed"]):::term
        cfg{"Secrets and<br/>HYPERDRIVE_ID set?"}:::dec
        tok{"Cloudflare accepts<br/>the API token?"}:::dec
        fail2(["Stop before<br/>touching data"]):::bad
        toC(("C")):::con
        fromB --> main
        main -- No --> pr
        main -- Yes --> cfg
        cfg -- No --> fail2
        cfg -- Yes --> tok
        tok -- No --> fail2
        tok -- Yes --> toC
    end
    subgraph C["③ Build and data"]
        direction TB
        fromC(("C")):::con
        build["Build static<br/>frontend"]
        mig[("Migrate Neon<br/>forward-only")]:::db
        reset{"reset_demo_data?"}:::dec
        reseed[("Truncate<br/>and reseed")]:::db
        ifempty[("Seed only<br/>if empty")]:::db
        toD(("D")):::con
        fromC --> build --> mig --> reset
        reset -- Yes --> reseed --> toD
        reset -- No --> ifempty --> toD
    end
    subgraph D["④ Release and verify"]
        direction TB
        fromD(("D")):::con
        deploy[["Bundle API,<br/>pywrangler deploy"]]:::sub
        secret["Set JWT_SECRET"]
        health{"Health shows new<br/>SHA in 150 s?"}:::dec
        smoke{"Smoke test<br/>15 of 15?"}:::dec
        live(["Live"]):::term
        fail3(["Deploy fails.<br/>Release flagged"]):::bad
        fromD --> deploy --> secret --> health
        health -- No --> fail3
        health -- Yes --> smoke
        smoke -- No --> fail3
        smoke -- Yes --> live
    end
    A ~~~ B ~~~ C ~~~ D

    classDef term fill:#dcfce7,stroke:#15803d,color:#14532d
    classDef bad fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d
    classDef dec fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef io fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e
    classDef db fill:#f1f5f9,stroke:#334155,color:#0f172a
    classDef sub fill:#ede9fe,stroke:#6d28d9,color:#3b0764
    classDef actor fill:#fff7ed,stroke:#c2410c,color:#7c2d12
    classDef con fill:#ffffff,stroke:#334155,color:#0f172a,stroke-width:2px
```

**Release recovery.** Rerun the workflow manually on `main` with `ref` set to the last good
commit, or run `wrangler rollback`. Migrations are forward-only, so a code rollback never
needs a schema rollback while migrations stay additive.

---

## Part 2 · Low-level design

### 2.1 Backend module structure

The FastAPI application is layered. Each layer depends only on the layers below it.

#### Figure 7 · Backend layers

```mermaid
flowchart TB
    subgraph api["app/api · HTTP layer"]
        routes["routes/<br/>auth.py · vehicles.py · health.py"]
        deps[["deps.py<br/>current_user · require_admin"]]:::sub
    end
    subgraph svc["app/services · use cases"]
        authsvc["auth.py<br/>login"]
        vehsvc["vehicles.py<br/>list · get · update,<br/>chooses 409 or 404"]
    end
    subgraph repo["app/repositories · all SQL"]
        users[("users.py")]:::db
        sessions[("sessions.py")]:::db
        vehicles[("vehicles.py<br/>atomic conditional UPDATE")]:::db
    end
    subgraph core["app/core · shared"]
        config["config.py<br/>Settings"]
        security[["security.py<br/>PBKDF2 · JWT"]]:::sub
        errors["errors.py<br/>JSON error envelope"]
        db[["db.py<br/>get_conn · db_ping"]]:::sub
    end

    routes --> deps
    routes --> authsvc
    routes --> vehsvc
    deps --> users
    deps --> security
    authsvc --> users
    authsvc --> sessions
    authsvc --> security
    vehsvc --> vehicles
    users --> db
    sessions --> db
    vehicles --> db

    db -.->|"local and CI"| pool[("asyncpg pool<br/>opened in app lifespan")]:::db
    db -.->|"Cloudflare:<br/>entry.py override"| hd[("Hyperdrive binding<br/>one connection per request")]:::db

    classDef db fill:#f1f5f9,stroke:#334155,color:#0f172a
    classDef sub fill:#ede9fe,stroke:#6d28d9,color:#3b0764
```

| Layer | Responsibility | Rule |
|---|---|---|
| `api/routes` | Parse input, pick the auth dependency, call a service | No SQL, no business rules |
| `api/deps.py` | Authenticate and authorize every protected request | Role and dealership come from the database, never the request |
| `services` | Use-case logic such as choosing 409 vs 404 | No HTTP details |
| `repositories` | Every SQL statement | Every vehicle query is scoped by `dealership_id` |
| `core` | Settings, connections, hashing, tokens, error format | No imports from layers above |

On Cloudflare, `cloudflare/src/entry.py` builds this same app and overrides three FastAPI
dependencies: `get_conn` and `db_ping` use the Hyperdrive binding, and `get_settings` reads
the Worker's `env`.

### 2.2 Login

`POST /api/auth/login` in `services/auth.py`.

#### Figure 8 · Login flowchart

```mermaid
flowchart LR
    subgraph A["① Validate and look up"]
        direction TB
        s(["POST /api/auth/login"]):::term
        in[/"email, password"/]:::io
        valid{"Body valid?"}:::dec
        e422(["422 validation_error"]):::bad
        find[("SELECT user + dealership<br/>WHERE lower(email) matches")]:::db
        found{"User found?"}:::dec
        burn[["burn_password_check<br/>equal PBKDF2 work"]]:::sub
        e401a(["401 invalid_credentials"]):::bad
        toB(("B")):::con
        s --> in --> valid
        valid -- No --> e422
        valid -- Yes --> find --> found
        found -- No --> burn --> e401a
        found -- Yes --> toB
    end
    subgraph B["② Verify and issue a session"]
        direction TB
        fromB(("B")):::con
        verify[["verify_password<br/>PBKDF2-SHA256, stored salt"]]:::sub
        match{"Hash matches?"}:::dec
        e401b(["401 invalid_credentials"]):::bad
        sess[("INSERT sessions<br/>expires in 30 min")]:::db
        jwt["Sign JWT HS256<br/>sub, sid, exp"]
        out[/"200: access_token,<br/>expires_at, user"/]:::io
        e(["End"]):::term
        fromB --> verify --> match
        match -- No --> e401b
        match -- Yes --> sess --> jwt --> out --> e
    end
    A ~~~ B

    classDef term fill:#dcfce7,stroke:#15803d,color:#14532d
    classDef bad fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d
    classDef dec fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef io fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e
    classDef db fill:#f1f5f9,stroke:#334155,color:#0f172a
    classDef sub fill:#ede9fe,stroke:#6d28d9,color:#3b0764
    classDef actor fill:#fff7ed,stroke:#c2410c,color:#7c2d12
    classDef con fill:#ffffff,stroke:#334155,color:#0f172a,stroke-width:2px
```

**Password storage.** `pbkdf2_sha256$<iterations>$<salt>$<hash>`, with a random 16-byte salt
per user. On Cloudflare the check runs through the runtime's native WebCrypto; locally it uses
`hashlib`. Both produce identical bytes, which is tested against the RFC 7914 vector.

### 2.3 Authenticating every protected request

`current_user` in `api/deps.py` runs before every protected endpoint.

#### Figure 9 · Token and session validation flowchart

```mermaid
flowchart LR
    subgraph A["① Token"]
        direction TB
        s(["Protected request"]):::term
        hdr{"Bearer token<br/>present?"}:::dec
        u401(["401 unauthenticated"]):::bad
        sig{"Signature valid,<br/>claims present?"}:::dec
        i401(["401 invalid_token"]):::bad
        exp{"JWT exp<br/>passed?"}:::dec
        x401(["401 token_expired"]):::bad
        toB(("B")):::con
        s --> hdr
        hdr -- No --> u401
        hdr -- Yes --> sig
        sig -- No --> i401
        sig -- Yes --> exp
        exp -- Yes --> x401
        exp -- No --> toB
    end
    subgraph B["② Session"]
        direction TB
        fromB(("B")):::con
        look[("SELECT session + user<br/>+ dealership by sid, sub")]:::db
        row{"Row found?"}:::dec
        i401b(["401 invalid_token"]):::bad
        rev{"revoked_at<br/>set?"}:::dec
        r401(["401 token_revoked"]):::bad
        sexp{"Session<br/>expired?"}:::dec
        x401b(["401 token_expired"]):::bad
        toC(("C")):::con
        fromB --> look --> row
        row -- No --> i401b
        row -- Yes --> rev
        rev -- Yes --> r401
        rev -- No --> sexp
        sexp -- Yes --> x401b
        sexp -- No --> toC
    end
    subgraph C["③ Role"]
        direction TB
        fromC(("C")):::con
        cu["CurrentUser: id, role,<br/>dealership from the row"]
        route{"Admin-only<br/>route?"}:::dec
        role{"role =<br/>admin?"}:::dec
        f403(["403 forbidden,<br/>no SQL runs"]):::bad
        go(["Run the endpoint"]):::term
        fromC --> cu --> route
        route -- No --> go
        route -- Yes --> role
        role -- No --> f403
        role -- Yes --> go
    end
    A ~~~ B ~~~ C

    classDef term fill:#dcfce7,stroke:#15803d,color:#14532d
    classDef bad fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d
    classDef dec fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef io fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e
    classDef db fill:#f1f5f9,stroke:#334155,color:#0f172a
    classDef sub fill:#ede9fe,stroke:#6d28d9,color:#3b0764
    classDef actor fill:#fff7ed,stroke:#c2410c,color:#7c2d12
    classDef con fill:#ffffff,stroke:#334155,color:#0f172a,stroke-width:2px
```

Read the columns left to right; each lettered circle continues at the matching circle in the
next column. **Expiry is enforced twice:** by the JWT `exp` claim and by `sessions.expires_at`.
**Logout** sets `sessions.revoked_at`, so the same token is refused immediately, even though
its JWT has not expired.

### 2.4 Updating a vehicle

`PUT /api/vehicles/{id}`, admin only. This is the core correctness path.

#### Figure 10 · Vehicle update flowchart

```mermaid
flowchart LR
    subgraph A["① Authorize and write"]
        direction TB
        s(["PUT /api/vehicles/{id}"]):::term
        in[/"make, model, year,<br/>status, version"/]:::io
        auth[["current_user +<br/>require_admin: Figure 9"]]:::sub
        body{"Body valid?<br/>no extra fields"}:::dec
        e422(["422 validation_error,<br/>nothing written"]):::bad
        upd[("UPDATE vehicles SET ...,<br/>version = version + 1<br/>WHERE id AND dealership_id<br/>AND version = sent version")]:::db
        rows{"1 row<br/>updated?"}:::dec
        out(["200: vehicle at<br/>the new version"]):::term
        toB(("B")):::con
        s --> in --> auth --> body
        body -- No --> e422
        body -- Yes --> upd --> rows
        rows -- Yes --> out
        rows -- No --> toB
    end
    subgraph B["② Explain a zero-row result"]
        direction TB
        fromB(("B")):::con
        look[("SELECT vehicle WHERE id<br/>AND dealership_id = caller's")]:::db
        exists{"Exists in caller's<br/>dealership?"}:::dec
        c409(["409 version_conflict<br/>+ current record"]):::bad
        n404(["404 not_found<br/>same as a missing id"]):::bad
        fromB --> look --> exists
        exists -- "Yes: stale<br/>version" --> c409
        exists -- "No: other dealership<br/>or missing" --> n404
    end
    A ~~~ B

    classDef term fill:#dcfce7,stroke:#15803d,color:#14532d
    classDef bad fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d
    classDef dec fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef io fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e
    classDef db fill:#f1f5f9,stroke:#334155,color:#0f172a
    classDef sub fill:#ede9fe,stroke:#6d28d9,color:#3b0764
    classDef actor fill:#fff7ed,stroke:#c2410c,color:#7c2d12
    classDef con fill:#ffffff,stroke:#334155,color:#0f172a,stroke-width:2px
```

**Why the update is atomic.** The version check is inside the `UPDATE`'s `WHERE` clause, so
checking and writing are one statement with no gap between them. The defective version,
commit `309eed5`, read the version first, compared it in Python, then wrote unconditionally.
Two requests could both pass the comparison and both write.

### 2.5 Two administrators saving at once

#### Figure 11 · Concurrent update sequence

```mermaid
sequenceDiagram
    autonumber
    participant A as Alice
    participant B as Bob
    participant W as Worker
    participant PG as Postgres

    A->>W: GET vehicle
    W-->>A: version 1
    B->>W: GET vehicle
    W-->>B: version 1
    par Same instant
        A->>W: PUT model LE, version 1
    and
        B->>W: PUT model SE, version 1
    end
    W->>PG: UPDATE WHERE version = 1 (Alice)
    Note over PG: takes the row lock
    W->>PG: UPDATE WHERE version = 1 (Bob)
    Note over PG: waits for the lock
    PG-->>W: Alice: 1 row, now version 2
    W-->>A: 200, version 2
    Note over PG: lock released, Bob's WHERE<br/>re-checked: version is 2
    PG-->>W: Bob: 0 rows
    W->>PG: SELECT vehicle (exists)
    W-->>B: 409 + Alice's record
    Note over B: Save disabled until Refresh
```

Verified three ways:

| Evidence | Result |
|---|---|
| `tests/test_concurrency.py`, with a barrier forcing the race | Fails on the defective code (`[200, 200]`), passes on the fix |
| CI | [Red run](https://github.com/aneeq178/dealership-inventory/actions/runs/40089597027) on `de5c4fc`, [green run](https://github.com/aneeq178/dealership-inventory/actions/runs/40089805129) on `6dc1a40` |
| `scripts/live_race.py` against production | 5/5 rounds of truly simultaneous saves, each with exactly one 200 and one 409 |

### 2.6 Request lifecycle across the stack

#### Figure 12 · Login, authenticated call and logout across the stack

```mermaid
sequenceDiagram
    autonumber
    participant Br as Browser
    participant E as Cloudflare
    participant W as Worker
    participant PG as Postgres

    Br->>E: POST /api/auth/login
    E->>W: /api/* runs the Worker
    W->>PG: SELECT user, INSERT session
    Note over W,PG: via Hyperdrive pool
    W-->>Br: 200 token + user
    Note over Br: token in sessionStorage

    Br->>E: GET /api/vehicles + token
    E->>W: run Worker
    W->>PG: SELECT session: valid?
    W->>PG: SELECT vehicles of user's dealership
    W-->>Br: 200 items

    Br->>E: POST /api/auth/logout
    E->>W: run Worker
    W->>PG: UPDATE sessions SET revoked_at
    W-->>Br: 204
    Note over Br,PG: same token now gets 401 token_revoked
```

### 2.7 Frontend: the edit page

`frontend/app/vehicles/edit/page.tsx`, with all API errors mapped centrally in `lib/api.ts`.
A 401 at any point signs the user out and returns them to the login page with the reason.

#### Figure 13 · Edit page flowchart

```mermaid
flowchart LR
    subgraph A["① Load"]
        direction TB
        s(["Open edit page"]):::term
        get[["GET /api/vehicles/{id}"]]:::sub
        loaded{"Status?"}:::dec
        nf(["Not found in<br/>your dealership"]):::bad
        out401(["401: sign out,<br/>login with reason"]):::bad
        admin{"Administrator?"}:::dec
        ro(["Read-only view"]):::term
        toB(("B")):::con
        s --> get --> loaded
        loaded -- 404 --> nf
        loaded -- 401 --> out401
        loaded -- 200 --> admin
        admin -- No --> ro
        admin -- Yes --> toB
    end
    subgraph B["② Edit and save"]
        direction TB
        fromB(("B")):::con
        edit[/"Edit fields<br/>form at version N"/]:::io
        cv{"Valid in the<br/>browser?"}:::dec
        fe[/"Field errors"/]:::io
        put[["PUT with version N"]]:::sub
        res{"Response?"}:::dec
        ok(["Saved: version N+1"]):::term
        cf[/"Conflict panel: who saved,<br/>diff, Save disabled"/]:::io
        reload[["Refresh: GET latest,<br/>form at version M"]]:::sub
        err[/"403 banner, or network<br/>error with retry"/]:::io
        fromB --> edit --> cv
        cv -- No --> fe --> edit
        cv -- Yes --> put --> res
        res -- 200 --> ok
        res -- 409 --> cf --> reload --> edit
        res -- 422 --> fe
        res -- "403 / 5xx" --> err --> edit
    end
    A ~~~ B

    classDef term fill:#dcfce7,stroke:#15803d,color:#14532d
    classDef bad fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d
    classDef dec fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef io fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e
    classDef db fill:#f1f5f9,stroke:#334155,color:#0f172a
    classDef sub fill:#ede9fe,stroke:#6d28d9,color:#3b0764
    classDef actor fill:#fff7ed,stroke:#c2410c,color:#7c2d12
    classDef con fill:#ffffff,stroke:#334155,color:#0f172a,stroke-width:2px
```

### 2.8 Data model

#### Figure 14 · Entity relationship diagram

```mermaid
erDiagram
    DEALERSHIPS ||--o{ USERS : employs
    DEALERSHIPS ||--o{ VEHICLES : owns
    USERS ||--o{ SESSIONS : "logs in"
    USERS |o--o{ VEHICLES : "last updated"

    DEALERSHIPS {
        uuid id PK
        text name UK
        timestamptz created_at
    }
    USERS {
        uuid id PK
        uuid dealership_id FK
        text email UK "case-insensitive"
        text name
        text role "admin or viewer"
        text password_hash
    }
    SESSIONS {
        uuid id PK
        uuid user_id FK
        timestamptz created_at
        timestamptz expires_at
        timestamptz revoked_at "set on logout"
    }
    VEHICLES {
        uuid id PK
        uuid dealership_id FK
        text stock_number
        text make
        text model
        int year
        text status
        int version "optimistic lock"
        timestamptz updated_at
        uuid updated_by FK
    }
```

| Table | Key constraints |
|---|---|
| `dealerships` | `name` unique |
| `users` | `dealership_id` NOT NULL FK (exactly one dealership); unique `lower(email)`; `role` in (`admin`, `viewer`) |
| `sessions` | FK to user, cascades on delete; `revoked_at` null until logout |
| `vehicles` | `dealership_id` NOT NULL FK; `year` 1900–2100; `status` in (`available`, `reserved`, `sold`); make and model 1–50 chars; `version` ≥ 1; `(dealership_id, stock_number)` unique; index on `dealership_id` |
| `schema_migrations` | One row per applied migration file |

### 2.9 API contract

| Method and path | Who | Success | Errors |
|---|---|---|---|
| `POST /api/auth/login` | Anyone | 200 token + user | 401 `invalid_credentials`, 422 |
| `POST /api/auth/logout` | Signed in | 204 | 401 |
| `GET /api/auth/me` | Signed in | 200 user + dealership | 401 |
| `GET /api/vehicles` | Signed in | 200 own dealership's vehicles | 401 |
| `GET /api/vehicles/{id}` | Signed in | 200 vehicle | 401, 404 |
| `PUT /api/vehicles/{id}` | Administrator | 200 vehicle, version + 1 | 401, 403, 404, 409, 422 |
| `GET /api/health` | Anyone | 200 `{status, db, version}` | 503 when the database is unreachable |

Every error uses one envelope, `{"error": {"code", "message", "details?"}}`, so the frontend
switches on `code`:

| Code | HTTP | Meaning |
|---|---|---|
| `unauthenticated` | 401 | No bearer token |
| `invalid_token` | 401 | Bad signature, malformed token, or unknown session |
| `token_expired` | 401 | JWT `exp` or session `expires_at` has passed |
| `token_revoked` | 401 | Session was logged out |
| `invalid_credentials` | 401 | Wrong email or password, indistinguishable |
| `forbidden` | 403 | Viewer attempted an administrator action |
| `not_found` | 404 | Missing, or belongs to another dealership |
| `version_conflict` | 409 | Stale `version`; `details.current` holds the saved record |
| `validation_error` | 422 | Invalid fields; `details.fields` lists them |

### 2.10 Cloudflare Worker internals

#### Figure 15 · Worker request handling

```mermaid
flowchart TB
    s(["Request for /api/*"]):::term
    snap[["Restore the Python snapshot<br/>taken at deploy time"]]:::sub
    asgi["Workers ASGI adapter puts the<br/>request and env into scope"]
    settings{"Settings already built<br/>in this isolate?"}:::dec
    build["Build Settings from env:<br/>JWT_SECRET secret, iterations,<br/>token lifetime, version"]
    conn[("Open asyncpg connection<br/>through the HYPERDRIVE binding")]:::db
    app[["FastAPI app: same routes,<br/>services and SQL as local"]]:::sub
    close["Close the connection"]
    out[/"HTTP response"/]:::io
    e(["End"]):::term

    s --> snap --> asgi --> settings
    settings -- No --> build --> conn
    settings -- Yes --> conn
    conn --> app --> close --> out --> e

    classDef term fill:#dcfce7,stroke:#15803d,color:#14532d
    classDef dec fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef io fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e
    classDef db fill:#f1f5f9,stroke:#334155,color:#0f172a
    classDef sub fill:#ede9fe,stroke:#6d28d9,color:#3b0764
```

**Measured cost.** Cloudflare records `cpuTimeMs` per request. Medians run from 25 ms
(`GET /api/auth/me`) to 130 ms (login), above the free plan's documented 10 ms. All 45
measured requests were served. The floor is the Python-on-WebAssembly runtime, not the
application logic.
