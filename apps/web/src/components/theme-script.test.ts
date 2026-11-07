import { describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY, themeInitScript } from "./theme-script";

describe("theme bootstrap", () => {
  it("uses Prism's storage key", () => {
    expect(THEME_STORAGE_KEY).toBe("crixet_light_mode_preference_v1");
  });

  it("defaults to dark", () => {
    expect(themeInitScript).toContain('?? "dark"');
  });

  it("sets the three attributes Prism sets", () => {
    for (const attr of [
      "classList.toggle",
      "dataset.theme",
      "dataset.themePreference",
      "colorScheme",
    ]) {
      expect(themeInitScript, attr).toContain(attr);
    }
  });

  it("is a self-contained IIFE so it runs before paint", () => {
    expect(themeInitScript).toMatch(/^\(function/);
    expect(themeInitScript).toContain("localStorage.getItem");
  });
});