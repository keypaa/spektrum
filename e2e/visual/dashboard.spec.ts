import { expect, test, type Page } from "@playwright/test";
import { compareAgainstReference, VISUAL_BUDGET } from "./compare";
import { seedVisualFixture, type Dataset } from "./fixtures";
import { expectDashboardReady, login, movePointerAway, setTheme } from "./helpers";

interface VisualCase {
  name: string;
  theme: "dark" | "light";
  dataset: Dataset;
  rows: number;
  act?: (page: Page) => Promise<void>;
}

const CASES: VisualCase[] = [
  { name: "dashboard--dark", theme: "dark", dataset: "dark", rows: 15 },
  {
    name: "dashboard--dark--import-menu",
    theme: "dark",
    dataset: "dark",
    rows: 15,
    act: async (page) => {
      await page.getByTestId("dashboard-header").getByRole("button", { name: "Import", exact: true }).click();
      await expect(page.getByRole("menuitem", { name: "Import Folder" })).toBeVisible();
    },
  },
  {
    name: "dashboard--dark--new-menu",
    theme: "dark",
    dataset: "dark",
    rows: 15,
    act: async (page) => {
      await page.getByTestId("dashboard-header").getByRole("button", { name: "New", exact: true }).click();
      await expect(page.getByRole("menuitem", { name: "New folder" })).toBeVisible();
    },
  },
  {
    name: "dashboard--dark--new-folder-dialog",
    theme: "dark",
    dataset: "dark",
    rows: 15,
    act: async (page) => {
      await page.getByTestId("dashboard-header").getByRole("button", { name: "New", exact: true }).click();
      await page.getByRole("menuitem", { name: "New folder" }).click();
      await expect(page.getByRole("dialog", { name: "New folder" })).toBeVisible();
    },
  },
  { name: "dashboard--light", theme: "light", dataset: "light", rows: 17 },
  {
    name: "dashboard--light--row-menu",
    theme: "light",
    dataset: "light",
    rows: 17,
    act: async (page) => {
      // Ref 46 opens the menu on the first row ("New Project").
      await page.getByRole("button", { name: "New Project actions" }).first().click();
      await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    },
  },
];

for (const c of CASES) {
  test(c.name, async ({ page }) => {
    seedVisualFixture(c.dataset);
    await setTheme(page, c.theme);
    await login(page);
    await expectDashboardReady(page, c.rows);
    await c.act?.(page);
    // Radix highlights the item under the pointer; the captures have none.
    await movePointerAway(page);
    const result = await compareAgainstReference(page, c.name);
    console.log(`${c.name}: ${(result.ratio * 100).toFixed(3)} %`);
    expect(result.ratio).toBeLessThanOrEqual(VISUAL_BUDGET);
  });
}
