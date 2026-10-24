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
