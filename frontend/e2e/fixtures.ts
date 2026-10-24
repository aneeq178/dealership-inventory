import { execFileSync } from "node:child_process";
import { expect, test as base, type Page } from "@playwright/test";
import { BACKEND_DIR, PYTHON, TEST_DATABASE_URL } from "./env";

export const PASSWORD = "Dealer#2026";

export const ACCOUNTS = {
  alice: { email: "alice.admin@northside.test", name: "Alice Morgan" },
  bob: { email: "bob.admin@northside.test", name: "Bob Chen" },
  victor: { email: "victor.viewer@northside.test", name: "Victor Reyes" },
  sara: { email: "sara.admin@southgate.test", name: "Sara Patel" },
} as const;

export const VEHICLES = {
  northCamry: "c1111111-0000-4000-8000-000000000001",
  southMalibu: "d2222222-0000-4000-8000-000000000001",
} as const;

/** Truncate and reseed so every test starts from the same known data. */
export function reseed() {
  execFileSync(PYTHON, ["-m", "scripts.seed"], {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, PASSWORD_HASH_ITERATIONS: "1000" },
    stdio: "ignore",
  });
}

export async function signIn(page: Page, email: string) {
  await page.goto("/login/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/vehicles\/$/);
}

export const test = base.extend<{ seeded: void }>({
  seeded: [
    async ({}, use) => {
      reseed();
      await use();
    },
    { auto: true },
  ],
});

export { expect };
