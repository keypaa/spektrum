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
