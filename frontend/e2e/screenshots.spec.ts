/**
 * Captures README screenshots into docs/screenshots. Skipped unless SCREENSHOTS=1:
 *   SCREENSHOTS=1 npx playwright test screenshots
 */
import path from "node:path";
import { ACCOUNTS, expect, signIn, test, VEHICLES } from "./fixtures";

const OUT = path.resolve(__dirname, "..", "..", "docs", "screenshots");
const shot = (name: string) => ({
  path: path.join(OUT, `${name}.png`),
  fullPage: true,
  animations: "disabled" as const,
});

test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture README screenshots");
test.use({ viewport: { width: 1360, height: 860 } });

test("capture screens", async ({ page, browser }) => {
  await page.goto("/login/");
  await page.getByRole("button", { name: /Alice Morgan/ }).click();
  await page.screenshot(shot("01-login"));

  await signIn(page, ACCOUNTS.alice.email);
  await expect(page.getByTestId("vehicle-table")).toBeVisible();
  await page.screenshot(shot("02-inventory-admin"));

  await page.goto(`/vehicles/edit/?id=${VEHICLES.northCamry}`);
  await expect(page.getByTestId("vehicle-version")).toHaveText("1");
  await page.getByLabel("Model").fill("Camry Hybrid");
  await page.screenshot(shot("03-edit"));

  // Conflict: Bob saves first from another browser.
  const bobCtx = await browser.newContext({ viewport: { width: 1360, height: 860 } });
  const bob = await bobCtx.newPage();
  await signIn(bob, ACCOUNTS.bob.email);
  await bob.goto(`/vehicles/edit/?id=${VEHICLES.northCamry}`);
  await bob.getByLabel("Availability").selectOption("reserved");
  await bob.getByRole("button", { name: "Save changes" }).click();
  await expect(bob.getByTestId("save-success")).toBeVisible();
  await bobCtx.close();

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("conflict-panel")).toBeVisible();
  await page.screenshot(shot("04-conflict"));

  const viewerCtx = await browser.newContext({ viewport: { width: 1360, height: 860 } });
  const viewer = await viewerCtx.newPage();
  await signIn(viewer, ACCOUNTS.victor.email);
  await expect(viewer.getByTestId("viewer-notice")).toBeVisible();
  await viewer.screenshot(shot("05-inventory-viewer"));
  await viewerCtx.close();

  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await mobileCtx.newPage();
  await signIn(mobile, ACCOUNTS.sara.email);
  await mobile.screenshot(shot("06-inventory-mobile"));
  await mobileCtx.close();
});
