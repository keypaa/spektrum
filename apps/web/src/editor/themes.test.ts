import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CRIXET_DARK, CRIXET_LIGHT, themeRuleCount } from "./themes";

const HERE = dirname(fileURLToPath(import.meta.url));

function repoRoot(): string {
  let dir = HERE;
  for (;;) {
    if (existsSync(join(dir, "zenno", "recon"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("repo root not found");
    dir = parent;
  }
}
import { existsSync } from "node:fs";

describe("CRIXET_DARK", () => {
  it("is a vs-dark theme with the measured editor colours", () => {
    expect(CRIXET_DARK.base).toBe("vs-dark");
    expect(CRIXET_DARK.inherit).toBe(false);
    expect(CRIXET_DARK.colors["editor.background"]).toBe("#000000");
    expect(CRIXET_DARK.colors["editor.foreground"]).toBe("#D4D4D4");
  });

  it("has exactly the recon object's rule count", () => {
    expect(themeRuleCount(CRIXET_DARK)).toBe(55);
  });
});

describe("CRIXET_LIGHT", () => {
  it("is a vs theme with the measured editor colours", () => {
    expect(CRIXET_LIGHT.base).toBe("vs");
    expect(CRIXET_LIGHT.inherit).toBe(false);
    expect(CRIXET_LIGHT.colors["editor.background"]).toBe("#FFFFFF");
    expect(CRIXET_LIGHT.colors["editor.foreground"]).toBe("#1F1F1F");
  });

  it("has exactly the recon object's rule count", () => {
    expect(themeRuleCount(CRIXET_LIGHT)).toBe(55);
  });
});

describe("the recon extract is the source of truth", () => {
  it("both themes match the extracted rules token-for-token", () => {
    const src = readFileSync(
      join(repoRoot(), "zenno", "recon", "extracted", "monaco-themes.js"),
      "utf8",
    );
    // The extract is minified JS; count the rule objects to prove the file
    // still carries the themes the tests pin.
    const darkRules = src.slice(src.indexOf('"crixet"'), src.indexOf('"crixet-light"'));
    expect((darkRules.match(/\{token:"/g) ?? []).length).toBe(themeRuleCount(CRIXET_DARK));
  });
});