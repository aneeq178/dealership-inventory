-- 001_init: dealerships, users, sessions, vehicles.
-- Forward-only. Applied by `python -m scripts.migrate`, recorded in schema_migrations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

CREATE TABLE dealerships (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL UNIQUE,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dealership_id  uuid NOT NULL REFERENCES dealerships(id),
    email          text NOT NULL,
    name           text NOT NULL,
    role           text NOT NULL CHECK (role IN ('admin', 'viewer')),
    password_hash  text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);
-- Case-insensitive unique email. Each user belongs to exactly one dealership (NOT NULL FK).
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

-- One row per login. Logout sets revoked_at; every authenticated request checks this row,
-- so a token stops working immediately on logout even though its JWT exp is still valid.
CREATE TABLE sessions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE vehicles (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dealership_id  uuid NOT NULL REFERENCES dealerships(id),
    stock_number   text NOT NULL,
    make           text NOT NULL CHECK (length(make) BETWEEN 1 AND 50),
    model          text NOT NULL CHECK (length(model) BETWEEN 1 AND 50),
    year           integer NOT NULL CHECK (year BETWEEN 1900 AND 2100),
    status         text NOT NULL CHECK (status IN ('available', 'reserved', 'sold')),
    -- Optimistic concurrency token. Every successful update increments it by exactly 1.
    version        integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    updated_by     uuid REFERENCES users(id),
    UNIQUE (dealership_id, stock_number)
);
-- Every vehicle query is scoped by dealership.
CREATE INDEX vehicles_dealership_id_idx ON vehicles (dealership_id);
