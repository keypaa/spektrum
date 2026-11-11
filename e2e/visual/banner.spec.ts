import { expect, test } from "@playwright/test";
import { compareAgainstReference, VISUAL_BUDGET } from "./compare";
import { seedVisualFixture, type Dataset } from "./fixtures";
import { expectDashboardReady, login, movePointerAway, setTheme } from "./helpers";

interface BannerCase {
  name: string;
  theme: "dark" | "light";
  dataset: Dataset;
  rows: number;
}

const CASES: BannerCase[] = [
  // Ref 1: dark, 15 rows, banner on.
  { name: "dashboard--dark--banner", theme: "dark", dataset: "dark", rows: 15 },
  // Ref 42 (21-01-54): light, empty state, banner on. The capture is signed
  // out; the chip area is masked (see e2e/baselines/README.md).
  { name: "dashboard--light--empty--banner", theme: "light", dataset: "empty", rows: 0 },
];

for (const c of CASES) {
  test(c.name, async ({ page }) => {
    seedVisualFixture(c.dataset);
    await setTheme(page, c.theme);
    await login(page);
    await expect(page.getByTestId("shutdown-banner")).toBeVisible();
    await expectDashboardReady(page, c.rows);
    await movePointerAway(page);
    const result = await compareAgainstReference(page, c.name);
    console.log(`${c.name}: ${(result.ratio * 100).toFixed(3)} %`);
    expect(result.ratio).toBeLessThanOrEqual(VISUAL_BUDGET);
  });
}