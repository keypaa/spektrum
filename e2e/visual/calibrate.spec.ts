import { test } from "@playwright/test";
import { compareAgainstReference } from "./compare";
import { seedVisualFixture } from "./fixtures";
import { login, movePointerAway, setTheme } from "./helpers";

test.beforeEach(() => {
  // Local calibration helper only: excluded from CI gate runs.
  test.skip(!!process.env.CI, "local calibration only");
});

const CASES = [
  ["dashboard--dark", "dark"],
  ["dashboard--light", "light"],
  ["dashboard--dark--import-menu", "dark", "import-menu"],
  ["dashboard--dark--new-menu", "dark", "new-menu"],
  ["dashboard--dark--new-folder-dialog", "dark", "new-folder-dialog"],
  ["dashboard--light--row-menu", "light", "row-menu"],
] as const;

for (const [name, theme, action] of CASES) {
  test(`calibrate ${name}`, async ({ page }) => {
    seedVisualFixture(theme);
    await setTheme(page, theme);
    await login(page);
    if (action === "import-menu") {
      await page.getByTestId("dashboard-header").getByRole("button", { name: "Import", exact: true }).click();
    } else if (action === "new-menu") {
      await page.getByTestId("dashboard-header").getByRole("button", { name: "New", exact: true }).click();
    } else if (action === "new-folder-dialog") {
      await page.getByTestId("dashboard-header").getByRole("button", { name: "New", exact: true }).click();
      await page.getByRole("menuitem", { name: "New folder" }).click();
    } else if (action === "row-menu") {
      await page.getByRole("button", { name: "New Project actions" }).first().click();
    }
    await movePointerAway(page);
    const result = await compareAgainstReference(page, name);
    console.log(`${name}: ${(result.ratio * 100).toFixed(3)} %`);
  });
}

// The banner cases need the other server:
//   pnpm test:visual -- --project=visual-banner -g calibrate
test("calibrate dashboard--dark--banner", async ({ page }) => {
  test.skip(test.info().project.name !== "visual-banner", "needs SHUTDOWN_BANNER=true");
  seedVisualFixture("dark");
  await setTheme(page, "dark");
  await login(page);
  const result = await compareAgainstReference(page, "dashboard--dark--banner");
  console.log(`dashboard--dark--banner: ${(result.ratio * 100).toFixed(3)} %`);
});