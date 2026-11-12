import { expect, test } from "@playwright/test";
import { compareAgainstReference, VISUAL_BUDGET } from "./compare";
import { seedVisualFixture } from "./fixtures";
import { login, movePointerAway, setTheme } from "./helpers";

// Phase 2 settings baselines: the six sections of the 960x720 modal, all in
// dark. Each case seeds the "dark" dashboard dataset, opens the account menu,
// opens Settings, clicks the section's nav item and compares. The mask strips
// everything outside the modal (the blurred dashboard behind it).
//
// Fused off until Task 20 performs the single visual pass: the settings modal
// does not exist yet, so these cannot pass.

const SECTIONS = [
  { name: "settings--editor--dark", nav: "Editor" },
  { name: "settings--pdf-viewer--dark", nav: "PDF Viewer" },
  { name: "settings--file-management--dark", nav: "File Management" },
  { name: "settings--data-controls--dark", nav: "Data Controls" },
  { name: "settings--beta--dark", nav: "Beta features" },
  { name: "settings--integrations--dark", nav: "Integrations" },
] as const;

for (const c of SECTIONS) {
  test.fixme(c.name, async ({ page }) => {
    seedVisualFixture("dark");
    await setTheme(page, "dark");
    await login(page);
    await page.getByTestId("account-chip").click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await page.getByRole("button", { name: c.nav, exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    await movePointerAway(page);
    const result = await compareAgainstReference(page, c.name);
    console.log(`${c.name}: ${(result.ratio * 100).toFixed(3)} %`);
    expect(result.ratio).toBeLessThanOrEqual(VISUAL_BUDGET);
  });
}
