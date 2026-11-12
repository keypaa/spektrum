import { expect, test } from "@playwright/test";
import { compareAgainstReference, VISUAL_BUDGET } from "./compare";
import { seedEditorFixture } from "./fixtures";
import { login, movePointerAway, setTheme } from "./helpers";

// Phase 2 editor baselines. Both captures show Prism's pre-compile state with
// the blank `main.tex` open, so each case seeds the "editor" fixture (one
// `New Project` / `main.tex` pair), opens the project and compares.
//
// Fused off until Task 20 performs the single visual pass: the editor shell
// does not exist yet, so these cannot pass.

const CASES = [
  { name: "editor--dark--blank", theme: "dark" },
  { name: "editor--light--blank", theme: "light" },
] as const;

for (const c of CASES) {
  test.fixme(c.name, async ({ page }) => {
    seedEditorFixture();
    await setTheme(page, c.theme);
    await login(page);
    // The dashboard row's name is a link to the editor route.
    await page.getByRole("link", { name: "New Project" }).first().click();
    await expect(page).toHaveURL(/\/u\/[0-9a-f-]{36}/);
    await expect(page.getByTestId("editor-root")).toBeVisible();
    await expect(page.getByTestId("monaco-editor")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await movePointerAway(page);
    const result = await compareAgainstReference(page, c.name);
    console.log(`${c.name}: ${(result.ratio * 100).toFixed(3)} %`);
    expect(result.ratio).toBeLessThanOrEqual(VISUAL_BUDGET);
  });
}
