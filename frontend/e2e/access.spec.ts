import { ACCOUNTS, expect, signIn, test, VEHICLES } from "./fixtures";

test("viewer sees inventory read-only and cannot edit", async ({ page }) => {
  await signIn(page, ACCOUNTS.victor.email);
  await expect(page.getByTestId("viewer-notice")).toContainText("read-only");
  await expect(page.getByRole("link", { name: /^Edit / })).toHaveCount(0);

  await page.getByRole("link", { name: "View 2022 Toyota Camry" }).click();
  await expect(page.getByTestId("readonly-notice")).toBeVisible();
  await expect(page.getByLabel("Model")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
});

test("another dealership's vehicle is not found, even by direct URL", async ({ page }) => {
  await signIn(page, ACCOUNTS.alice.email);
  await page.goto(`/vehicles/edit/?id=${VEHICLES.southMalibu}`);
  await expect(page.getByTestId("load-error")).toContainText("Vehicle not found");
  await expect(page.getByText("Chevrolet")).toHaveCount(0);
});

test("an invalid or expired session sends the user back to sign in with a reason", async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.alice.email);
  // Simulate an invalidated token (e.g. revoked elsewhere or tampered with).
  await page.evaluate(() => sessionStorage.setItem("dealership.accessToken", "not-a-valid-token"));
  await page.reload();
  await expect(page).toHaveURL(/\/login\/\?reason=invalid_token/);
  await expect(page.getByTestId("login-reason")).toContainText("no longer valid");
});

test("signing out in one tab invalidates the session server-side", async ({ page, context }) => {
  await signIn(page, ACCOUNTS.alice.email);
  const token = await page.evaluate(() => sessionStorage.getItem("dealership.accessToken"));

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\//);

  // Re-using the old token from another tab is rejected by the server.
  const other = await context.newPage();
  await other.goto("/login/");
  await other.evaluate((t) => sessionStorage.setItem("dealership.accessToken", t!), token);
  await other.goto("/vehicles/");
  await expect(other).toHaveURL(/\/login\/\?reason=token_revoked/);
  await expect(other.getByTestId("login-reason")).toContainText("signed out");
});
