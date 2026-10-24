import { defineConfig, devices } from "@playwright/test";
import { BACKEND_DIR, BACKEND_ENV, PYTHON } from "./e2e/env";

/**
 * End-to-end tests run the real stack in its production shape:
 *   FastAPI serves the API *and* the static frontend build (frontend/out) on one origin,
 *   backed by a real Postgres test database that is reset first and reseeded per test.
 *
 * Prerequisites: Postgres running (docker compose up -d), backend venv installed,
 * and `npm run build` (the `test:e2e` script does the build for you).
 */
const PORT = Number(process.env.E2E_PORT ?? 8100);
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1, // tests share one seeded database
  retries: CI ? 1 : 0,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Rebuild schema + seed, then serve API and built frontend together.
    command: `"${PYTHON}" -m scripts.reset && "${PYTHON}" -m uvicorn app.main:app --port ${PORT}`,
    cwd: BACKEND_DIR,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    env: BACKEND_ENV as Record<string, string>,
  },
});
