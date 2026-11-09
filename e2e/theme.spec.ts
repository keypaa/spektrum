import { expect, test } from "@playwright/test";

// Theme + fonts on /login (spec §5.1, Phase 0 exit checklist): the boot script
// applies the stored preference before paint, and the page renders in the
// bundled Crixet Sans face — in both themes.
const THEME_KEY = "crixet_light_mode_preference_v1";

for (const theme of ["light", "dark"] as const) {
  test(`login uses Crixet Sans in the ${theme} theme`, async ({ page }) => {
    // set the preference before any page script runs, like a returning user
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [THEME_KEY, theme],
    );
    await page.goto("/login");

    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", theme);
    await expect(html).toHaveAttribute("data-theme-preference", theme);

    const state = await page.evaluate(() => ({
      dark: document.documentElement.classList.contains("dark"),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      fontFamily: getComputedStyle(document.body).fontFamily,
    }));
    expect(state.dark).toBe(theme === "dark");
    expect(state.colorScheme).toBe(theme);
    expect(state.fontFamily).toContain("Crixet Sans");

    // the face is real and decoded — not just a fallback in the font stack.
    // Only weights the page renders are requested; the rest stay lazy.
    const fontFaces = await page.evaluate(async () => {
      await document.fonts.load('400 16px "Crixet Sans"');
      await document.fonts.ready;
      return {
        check: document.fonts.check('400 16px "Crixet Sans"'),
        regular: [...document.fonts].some(
          (face) =>
            face.family.replaceAll('"', "") === "Crixet Sans" &&
            face.weight === "400" &&
            face.style === "normal" &&
            face.status === "loaded",
        ),
        anyLoaded: [...document.fonts].some(
          (face) =>
            face.family.replaceAll('"', "") === "Crixet Sans" &&
            face.status === "loaded",
        ),
      };
    });
    expect(fontFaces.check).toBe(true);
    expect(fontFaces.regular).toBe(true);
    expect(fontFaces.anyLoaded).toBe(true);
  });
}
