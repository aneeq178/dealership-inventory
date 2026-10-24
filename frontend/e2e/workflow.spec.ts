import { ACCOUNTS, expect, signIn, test } from "./fixtures";

test("admin signs in, sees own inventory, updates a vehicle, change survives reload, signs out", async ({
  page,
}) => {
  // Login
  await signIn(page, ACCOUNTS.alice.email);
  await expect(page.getByTestId("dealership-name")).toHaveText("Northside Motors");
  await expect(page.getByTestId("user-name")).toHaveText(ACCOUNTS.alice.name);

  // Inventory display: exactly this dealership's four vehicles, none from the other one.
  const table = page.getByTestId("vehicle-table");
  await expect(table.locator("tbody tr")).toHaveCount(4);
  for (const stock of ["N-1001", "N-1002", "N-1003", "N-1004"]) {
    await expect(page.getByTestId(`vehicle-row-${stock}`)).toBeVisible();
  }
  await expect(table).not.toContainText("S-2001");

  // Allowed update
  await page.getByRole("link", { name: "Edit 2022 Toyota Camry" }).click();
  await expect(page.getByTestId("vehicle-title")).toHaveText("2022 Toyota Camry");
  await expect(page.getByTestId("vehicle-version")).toHaveText("1");

  await page.getByLabel("Model").fill("Camry Hybrid");
  await page.getByLabel("Year").fill("2024");
  await page.getByLabel("Availability").selectOption("reserved");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByTestId("save-success")).toContainText("version 2");
  await expect(page.getByTestId("vehicle-version")).toHaveText("2");

  // Persisted: a full page reload fetches the saved values from the server.
  await page.reload();
  await expect(page.getByLabel("Model")).toHaveValue("Camry Hybrid");
  await expect(page.getByLabel("Year")).toHaveValue("2024");
  await expect(page.getByLabel("Availability")).toHaveValue("reserved");
  await expect(page.getByTestId("vehicle-version")).toHaveText("2");

  // And the list shows it too.
  await page.getByRole("link", { name: "Back to inventory" }).click();
  const row = page.getByTestId("vehicle-row-N-1001");
  await expect(row).toContainText("2024 Toyota Camry Hybrid");
  await expect(row).toContainText("Reserved");
  await expect(row).toContainText("by Alice Morgan");

  // Logout revokes the session and protected pages bounce back to login.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\/\?reason=signed_out/);
  await expect(page.getByTestId("login-reason")).toContainText("signed out");
  await page.goto("/vehicles/");
  await expect(page).toHaveURL(/\/login\/$/);
});

test("invalid credentials show a clear error and do not sign in", async ({ page }) => {
  await page.goto("/login/");
  await page.getByLabel("Email").fill(ACCOUNTS.alice.email);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("login-error")).toHaveText("Incorrect email or password.");
  await expect(page).toHaveURL(/\/login\/$/);
});
