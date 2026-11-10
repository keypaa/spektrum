import { expect, test } from "@playwright/test";
import { compareAgainstReference, VISUAL_BUDGET } from "./compare";
import { seedVisualFixture } from "./fixtures";
import { login, setTheme } from "./helpers";

test("dashboard dark matches the reference", async ({ page }) => {
  seedVisualFixture("dark");
  await setTheme(page, "dark");
  await login(page);
  const result = await compareAgainstReference(page, "dashboard--dark");
  expect(result.ratio).toBeLessThanOrEqual(VISUAL_BUDGET);
});
