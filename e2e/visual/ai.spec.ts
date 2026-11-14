import { expect, test } from "@playwright/test";
import { recordRatio } from "./compare";
import { seedAiFixture, seedEditorFixture } from "./fixtures";
import { login, setTheme } from "./helpers";

// Phase 4 composer/transcript/diff baselines. These have no immutable Prism
// reference, so they are captured and logged only (recordRatio) — never gated.

async function openEditor(page: import("@playwright/test").Page): Promise<string> {
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page).toHaveURL(/\/u\/[0-9a-f-]{36}/);
  const projectId = new URL(page.url()).pathname.split("/")[2]!;
  await expect(page.getByTestId("editor-root")).toBeVisible();
  await expect(page.getByTestId("monaco-editor")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return projectId;
}

async function openThread(
  page: import("@playwright/test").Page,
): Promise<string> {
  const projectId = await openEditor(page);
  const res = await page.request.get(`/api/projects/${projectId}/threads`);
  const body = (await res.json()) as { threads: Array<{ id: string }> };
  const threadId = body.threads[0]!.id;
  await page.goto(`/u/${projectId}?thread=${threadId}`);
  await expect(page.getByTestId("editor-root")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return projectId;
}

for (const theme of ["dark", "light"] as const) {
  test(`composer--${theme}--empty`, async ({ page }) => {
    seedEditorFixture();
    await setTheme(page, theme);
    await login(page);
    await openEditor(page);
    await recordRatio(page, `composer--${theme}--empty`);
  });

  test(`composer--${theme}--thread`, async ({ page }) => {
    seedEditorFixture();
    seedAiFixture();
    await setTheme(page, theme);
    await login(page);
    await openThread(page);
    await expect(page.getByText("Rename the introduction").first()).toBeVisible();
    await recordRatio(page, `composer--${theme}--thread`);
  });

  test(`diff--${theme}--default`, async ({ page }) => {
    seedEditorFixture();
    seedAiFixture();
    await setTheme(page, theme);
    await login(page);
    await openThread(page);
    await expect(page.getByTestId("diff-widget")).toBeVisible();
    await recordRatio(page, `diff--${theme}--default`);
  });
}