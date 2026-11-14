import { expect, test } from "@playwright/test";
import { compareAgainstReference, VISUAL_BUDGET } from "./compare";
import { seedPdfFixture } from "./fixtures";
import { login, movePointerAway, setTheme } from "./helpers";

async function openLogs(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("pdf-pane")).toBeVisible();
  await page.getByRole("button", { name: "Tools" }).click();
  await page.getByRole("menuitem", { name: "Logs" }).click();
  await expect(page.getByTestId("info-panel")).toBeVisible();
}

test("logs--dark--default", async ({ page }) => {
  seedPdfFixture();
  await setTheme(page, "dark");
  await login(page);
  await openLogs(page);
  await page.evaluate(() => document.fonts.ready);
  await movePointerAway(page);
  const result = await compareAgainstReference(page, "logs--dark--default");
  console.log(`logs--dark--default: ${(result.ratio * 100).toFixed(3)} %`);
  expect(result.ratio).toBeLessThanOrEqual(VISUAL_BUDGET);
});

test("logs--dark--filter-menu", async ({ page }) => {
  seedPdfFixture();
  await setTheme(page, "dark");
  await login(page);
  await openLogs(page);
  await page.getByLabel("Logs filter").click();
  await page.getByRole("menuitem", { name: "Warnings only" }).click();
  await page.getByLabel("Logs filter").click();
  await movePointerAway(page);
  const result = await compareAgainstReference(
    page,
    "logs--dark--filter-menu",
  );
  console.log(`logs--dark--filter-menu: ${(result.ratio * 100).toFixed(3)} %`);
  expect(result.ratio).toBeLessThanOrEqual(VISUAL_BUDGET);
});