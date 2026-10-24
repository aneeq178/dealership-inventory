import path from "node:path";

export const BACKEND_DIR = path.resolve(__dirname, "..", "..", "backend");

/** Python inside the backend virtualenv (override with PYTHON=...). */
export const PYTHON =
  process.env.PYTHON ??
  path.join(
    BACKEND_DIR,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );

/** Same isolated database the pytest suite uses; never the development database. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://dealer:dealer@localhost:5432/dealership_test";

/**
 * Complete backend environment for E2E, used by both the API server and the per-test reseed.
 * Every required setting is explicit so nothing depends on a developer's backend/.env
 * (which does not exist in CI).
 */
export const BACKEND_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: "e2e-only-jwt-secret-0123456789abcdefghij",
  PASSWORD_HASH_ITERATIONS: "1000",
  CORS_ORIGINS: "",
  STATIC_DIR: path.resolve(__dirname, "..", "out"),
  APP_VERSION: "e2e",
};
