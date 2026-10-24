import { ACCOUNTS, expect, signIn, test, VEHICLES } from "./fixtures";

/**
 * Reproduces the concurrent-edit conflict in the UI (also the manual reproduction steps in the
 * README): two administrators of the same dealership open the same vehicle at version 1,
 * the first saves, the second's save is rejected and they are asked to refresh.
 */
test("second admin saving a stale version sees the conflict and must refresh before retrying", async ({
  browser,
}) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();
  const editUrl = `/vehicles/edit/?id=${VEHICLES.northCamry}`;

  await signIn(alice, ACCOUNTS.alice.email);
  await signIn(bob, ACCOUNTS.bob.email);

  // Both load the same vehicle at the same version.
  await alice.goto(editUrl);
  await bob.goto(editUrl);
  await expect(alice.getByTestId("vehicle-version")).toHaveText("1");
  await expect(bob.getByTestId("vehicle-version")).toHaveText("1");

  // Both make different edits.
  await alice.getByLabel("Model").fill("Camry LE");
  await bob.getByLabel("Model").fill("Camry SE");
  await bob.getByLabel("Availability").selectOption("sold");

  // Alice saves first and wins.
  await alice.getByRole("button", { name: "Save changes" }).click();
  await expect(alice.getByTestId("save-success")).toBeVisible();

  // Bob saves from the stale version and is told why it failed.
  await bob.getByRole("button", { name: "Save changes" }).click();
  const panel = bob.getByTestId("conflict-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Someone else saved this vehicle first");
  await expect(panel).toContainText("Alice Morgan");
  await expect(panel).toContainText("Your changes were not saved");
  await expect(bob.getByTestId("conflict-current-model")).toHaveText("Camry LE");
  await expect(bob.getByTestId("conflict-current-status")).toHaveText("Available");

  // Bob cannot retry until he refreshes.
  await expect(bob.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await expect(bob.getByLabel("Model")).toBeDisabled();

  await bob.getByRole("button", { name: "Refresh to latest version" }).click();
  await expect(bob.getByTestId("refreshed-notice")).toContainText("version 2");
  await expect(bob.getByLabel("Model")).toHaveValue("Camry LE"); // Alice's change kept
  await expect(bob.getByTestId("vehicle-version")).toHaveText("2");

  // After refreshing, Bob re-applies his change and it succeeds on top of Alice's.
  await bob.getByLabel("Availability").selectOption("sold");
  await bob.getByRole("button", { name: "Save changes" }).click();
  await expect(bob.getByTestId("save-success")).toContainText("version 3");

  // Alice reloads and sees both changes.
  await alice.reload();
  await expect(alice.getByLabel("Model")).toHaveValue("Camry LE");
  await expect(alice.getByLabel("Availability")).toHaveValue("sold");

  await aliceCtx.close();
  await bobCtx.close();
});
