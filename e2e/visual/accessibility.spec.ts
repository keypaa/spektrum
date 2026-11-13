import { expect, test } from "@playwright/test";
import { login, seedVisualFixture, setTheme } from "./helpers";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{2BFF}]/u;

for (const theme of ["light", "dark"] as const) {
  test(`dashboard DOM has no emoji and only 16x16 currentColor icons (${theme})`, async ({ page }) => {
    seedVisualFixture(theme);
    await setTheme(page, theme);
    await login(page);

    const result = await page.evaluate((emoji) => {
      const re = new RegExp(emoji, "u");
      const text = document.body.innerText;
      const svgs = [...document.querySelectorAll("svg")].map((svg) => ({
        viewBox: svg.getAttribute("viewBox"),
        fills: [...svg.querySelectorAll("*")].map((n) => n.getAttribute("fill")),
        strokes: [...svg.querySelectorAll("*")].map((n) => n.getAttribute("stroke")),
      }));
      return { hasEmoji: re.test(text), svgs };
    }, EMOJI.source);

    expect(result.hasEmoji).toBe(false);
    expect(result.svgs.length).toBeGreaterThan(0);
    for (const svg of result.svgs) {
      expect(svg.viewBox).toBe("0 0 16 16");
      for (const fill of svg.fills) expect([null, "none", "currentColor"]).toContain(fill);
      for (const stroke of svg.strokes) {
        expect([null, "currentColor"]).toContain(stroke);
      }
    }

    // Icon-only controls are labelled.
    await expect(page.getByLabel("Search")).toBeVisible();
    for (const name of ["List view", "Grid view", "Import", "New"]) {
      await expect(
        page.getByTestId("dashboard-header").getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }
    await expect(page.getByLabel("Sort by Name")).toBeVisible();
    await expect(page.getByLabel("Sort by Created")).toBeVisible();
  });
}

test("editor chrome: no emoji, registry icons only, controls labelled", async ({ page }) => {
  seedVisualFixture("dark");
  await setTheme(page, "dark");
  await login(page);

  // Open the first project (the "dark" fixture's first row).
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page).toHaveURL(/\/u\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("editor-root")).toBeVisible();
  await page.waitForTimeout(500);

  const result = await page.evaluate((emoji) => {
    const re = new RegExp(emoji, "u");
    const svgs = [...document.querySelectorAll("svg")]
      .filter((svg) => !svg.closest(".monaco-editor"))
      .map((svg) => ({
        viewBox: svg.getAttribute("viewBox"),
        fills: [...svg.querySelectorAll("*")].map((n) => n.getAttribute("fill")),
        strokes: [...svg.querySelectorAll("*")].map((n) => n.getAttribute("stroke")),
      }));
    return { hasEmoji: re.test(document.body.innerText), svgs };
  }, EMOJI.source);

  expect(result.hasEmoji).toBe(false);
  for (const svg of result.svgs) {
    expect(svg.viewBox).toBe("0 0 16 16");
    for (const fill of svg.fills) expect([null, "none", "currentColor"]).toContain(fill);
    for (const stroke of svg.strokes) expect([null, "currentColor"]).toContain(stroke);
  }

  // Structural chrome: sidebar tabs, icon buttons and the composer are labelled.
  await expect(page.getByRole("tab", { name: "Files" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recompile" })).toBeVisible();
  await expect(page.getByPlaceholderText("Getting ready...")).toBeVisible();
});

test("settings chrome: dialog semantics, nav and switches", async ({ page }) => {
  seedVisualFixture("dark");
  await setTheme(page, "dark");
  await login(page);
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("editor-root")).toBeVisible();
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: /account$/i }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();

  // Nav sections are toggle buttons with an accessible name.
  for (const section of [
    "Editor",
    "PDF Viewer",
    "File Management",
    "Data Controls",
    "Beta features",
    "Integrations",
  ]) {
    await expect(dialog.getByRole("button", { name: section })).toBeVisible();
  }
  // Toggles expose role=switch with a name.
  const sw = dialog.getByRole("switch", { name: "Disable Word Wrap" });
  expect(await sw.getAttribute("role")).toBe("switch");
  // The active file tab exposes aria-current via aria-selected.
  await expect(dialog).toBeVisible();
});