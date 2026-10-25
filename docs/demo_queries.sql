-- Queries for the walkthrough video. Paste one at a time into Neon's SQL Editor
-- (project "Dealership Inventory", branch production, database neondb).
-- Read-only: nothing here changes data.

-- 1. Inventory as stored: version and who last changed each vehicle.
--    Run before and after an edit in the UI: the edited row's version goes up by exactly 1
--    and updated_by shows the admin.
SELECT d.name AS dealership, v.stock_number, v.year, v.make, v.model, v.status,
       v.version, to_char(v.updated_at, 'HH24:MI:SS') AS updated_at, u.name AS updated_by
FROM vehicles v
JOIN dealerships d ON d.id = v.dealership_id
LEFT JOIN users u ON u.id = v.updated_by
ORDER BY d.name, v.stock_number;

-- 2. Users: one dealership each, two admins + one viewer per dealership,
--    passwords stored only as salted PBKDF2 hashes (iteration count visible, no plaintext).
SELECT d.name AS dealership, u.email, u.role,
       split_part(u.password_hash, '$', 1) AS algorithm,
       split_part(u.password_hash, '$', 2) AS iterations,
       left(split_part(u.password_hash, '$', 4), 12) || '…' AS hash_prefix
FROM users u JOIN dealerships d ON d.id = u.dealership_id
ORDER BY d.name, u.role, u.email;

-- 3. Sessions: every login creates a row; logout sets revoked_at.
--    Sign in and out in the UI, then run this: the newest row has revoked_at filled in.
SELECT u.email, to_char(s.created_at, 'HH24:MI:SS') AS signed_in,
       to_char(s.expires_at, 'HH24:MI:SS') AS expires,
       coalesce(to_char(s.revoked_at, 'HH24:MI:SS'), '— active') AS revoked
FROM sessions s JOIN users u ON u.id = s.user_id
ORDER BY s.created_at DESC
LIMIT 8;

-- 4. Isolation at a glance: each dealership's vehicles are separate rows tied by FK.
SELECT d.name AS dealership, count(*) AS vehicles,
       count(*) FILTER (WHERE v.status = 'available') AS available
FROM vehicles v JOIN dealerships d ON d.id = v.dealership_id
GROUP BY d.name ORDER BY d.name;

-- 5. Migrations applied by the pipeline.
SELECT version, applied_at FROM schema_migrations ORDER BY version;
