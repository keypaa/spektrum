import { expect, test } from "@playwright/test";
import { compareAgainstReference } from "./compare";
import { seedPdfFixture } from "./fixtures";
import { login, movePointerAway, setTheme } from "./helpers";

async function openPanel(
  page: import("@playwright/test").Page,
  tab: string,
): Promise<void> {
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("pdf-pane")).toBeVisible();
  await page.getByRole("button", { name: "Tools" }).click();
  await page.getByRole("menuitem", { name: tab }).click();
  await expect(page.getByTestId("info-panel")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

for (const tab of ["Project Info", "Versions", "Comments"]) {
  const name = `info--dark--${tab.toLowerCase().replace(/ /g, "-")}`;
  test(name, async ({ page }) => {
    seedPdfFixture();
    await setTheme(page, "dark");
    await login(page);
    await openPanel(page, tab);
    await movePointerAway(page);
    const result = await compareAgainstReference(page, name);
    console.log(`${name}: ${(result.ratio * 100).toFixed(3)} %`);
    expect(result.ratio).toBeLessThanOrEqual(0.05);
  });
}

test("share--dark", async ({ page }) => {
  seedPdfFixture();
  await setTheme(page, "dark");
  await login(page);
  await openPanel(page, "Share");
  await expect(page.getByRole("dialog", { name: /Share/ })).toBeVisible();
  await movePointerAway(page);
  const result = await compareAgainstReference(page, "share--dark");
  console.log(`share--dark: ${(result.ratio * 100).toFixed(3)} %`);
  expect(result.ratio).toBeLessThanOrEqual(0.05);
});