import { expect, test } from "@playwright/test";
import { compareAgainstReference, VISUAL_BUDGET } from "./compare";
import { seedPdfFixture } from "./fixtures";
import { login, movePointerAway, setTheme } from "./helpers";

async function openProject(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("pdf-pane")).toBeVisible();
  await expect(
    page.locator("[data-testid='pdf-viewport'] canvas").first(),
  ).toBeVisible({ timeout: 30_000 });
}

const CASES = [
  { name: "pdf--dark--compiled", theme: "dark" as const },
  { name: "pdf--light--search", theme: "light" as const },
];

for (const c of CASES) {
  test(c.name, async ({ page }) => {
    seedPdfFixture();
    await setTheme(page, c.theme);
    await login(page);
    await openProject(page);
    if (c.name.endsWith("search")) {
      await page.keyboard.press("Control+f");
      await expect(page.getByTestId("pdf-search")).toBeVisible();
    }
    await page.evaluate(() => document.fonts.ready);
    await movePointerAway(page);
    const result = await compareAgainstReference(page, c.name);
    console.log(`${c.name}: ${(result.ratio * 100).toFixed(3)} %`);
    expect(result.ratio).toBeLessThanOrEqual(VISUAL_BUDGET);
  });
}

test("pdf--dark--more-menu", async ({ page }) => {
  seedPdfFixture();
  await setTheme(page, "dark");
  await login(page);
  await openProject(page);
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await movePointerAway(page);
  const result = await compareAgainstReference(page, "pdf--dark--more-menu");
  console.log(`pdf--dark--more-menu: ${(result.ratio * 100).toFixed(3)} %`);
  expect(result.ratio).toBeLessThanOrEqual(VISUAL_BUDGET);
});

test("pdf--dark--zoom-menu", async ({ page }) => {
  seedPdfFixture();
  await setTheme(page, "dark");
  await login(page);
  await openProject(page);
  await page.getByTestId("pdf-zoom").click();
  await expect(page.getByRole("menu")).toBeVisible();
  await movePointerAway(page);
  const result = await compareAgainstReference(page, "pdf--dark--zoom-menu");
  console.log(`pdf--dark--zoom-menu: ${(result.ratio * 100).toFixed(3)} %`);
  expect(result.ratio).toBeLessThanOrEqual(VISUAL_BUDGET);
});

test("editor--light--context-menu", async ({ page }) => {
  seedPdfFixture();
  await setTheme(page, "light");
  await login(page);
  await openProject(page);
  await page.getByTestId("monaco-editor").click({ button: "right" });
  await expect(
    page.getByRole("menu", { name: "Editor context menu" }),
  ).toBeVisible();
  await movePointerAway(page);
  const result = await compareAgainstReference(
    page,
    "editor--light--context-menu",
  );
  console.log(
    `editor--light--context-menu: ${(result.ratio * 100).toFixed(3)} %`,
  );
  expect(result.ratio).toBeLessThanOrEqual(VISUAL_BUDGET);
});