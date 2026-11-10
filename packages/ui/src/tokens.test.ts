import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");

// Values pinned from packages/ui/styles/tokens.css as assembled 2026-11-07.
// The CSS is the authority (spec §5.4): most semantic tokens are aliases such as
// `var(--neutral-900)`, so we pin the declaration text, not the resolved hex.
const DARK = {
  "--neutral-900": "#161616",
  "--neutral-100": "#e8e8e8",
  "--bg-app": "var(--neutral-900)",
  "--bg-code": "var(--neutral-950)",
  "--bg-sidepanel": "var(--neutral-800)",
  "--fg-primary": "var(--neutral-50)",
  "--fg-secondary": "var(--neutral-400)",
  "--modal-bg": "var(--neutral-800)",
  "--ai-bg": "var(--neutral-900)",
  "--button-primary-bg": "var(--neutral-50)",
  "--button-primary-text": "var(--neutral-900)",
  "--dashboard-card-bg": "#27282980",
  "--background": "0 0% 3.9%",
  "--input": "0 0% 14.9%",
} as const;

const LIGHT = {
  "--neutral-900": "#161616",
  "--neutral-100": "#f1f1f1",
  "--bg-app": "var(--neutral-100)",
  "--bg-code": "var(--neutral-50)",
  "--bg-sidepanel": "var(--neutral-100)",
  "--fg-primary": "var(--neutral-950)",
  "--modal-bg": "var(--neutral-50)",
  "--ai-bg": "var(--neutral-50)",
  "--button-primary-bg": "var(--neutral-900)",
  "--shadow-surface": "0 10px 24px #0000001f,0 1px 2px #00000014",
  "--dashboard-card-bg": "var(--neutral-50)",
} as const;

// Names declared only in :root — they survive in both themes because the
// theme blocks do not define them (spec §5.2).
const ROOT_ONLY = {
  "--neutral-150": "#e2e2e2",
  "--neutral-450": "#737373",
  "--border-code": "var(--neutral-800)",
  "--brand-500": "#81d6ee",
  "--red-500": "#ff3d2f",
  "--orange-500": "#ffb200",
} as const;

function declared(block: string, name: string): string | undefined {
  // [^;}]+ so the match can never run past the block's closing brace
  const m = block.match(
    new RegExp(name.replace(/[-]/g, "\\-") + "\\s*:\\s*([^;}]+)"),
  );
  return m?.[1]?.trim().replace(/\s+/g, " ");
}

function section(marker: string): string {
  // anchor on the rule, not the bare word (the header comment mentions ":root")
  const i = css.indexOf(marker + " {");
  expect(i, marker).toBeGreaterThan(-1);
  const j = css.indexOf("}", i);
  return css.slice(i, j);
}

describe("design tokens", () => {
  it("pins the dark theme values", () => {
    const dark = section("html.dark,html:not(.dark) .force-dark");
    for (const [k, v] of Object.entries(DARK)) {
      expect(declared(dark, k), k).toBe(v);
    }
  });

  it("pins the light theme values", () => {
    const light = section("html:not(.dark),html.dark .force-light");
    for (const [k, v] of Object.entries(LIGHT)) {
      expect(declared(light, k), k).toBe(v);
    }
  });

  it("keeps the :root-only names that survive in both themes", () => {
    const root = section(":root");
    for (const [k, v] of Object.entries(ROOT_ONLY)) {
      expect(declared(root, k), k).toBe(v);
    }
  });

  it("pins the cascade structure of spec §5.2", () => {
    // Block order in the file: :root first, then light, then dark.
    const rootIdx = css.indexOf(":root {");
    const lightIdx = css.indexOf("html:not(.dark),html.dark .force-light {");
    const darkIdx = css.indexOf("html.dark,html:not(.dark) .force-dark {");
    expect(rootIdx).toBeGreaterThan(-1);
    expect(lightIdx).toBeGreaterThan(rootIdx);
    expect(darkIdx).toBeGreaterThan(lightIdx);

    // --neutral-150 / --neutral-450 exist ONLY in :root (never in a theme
    // block) — that is the quirk that makes them survive in both themes,
    // because the theme blocks (specificity 0,1,1) outrank :root (0,1,0)
    // for every name they DO define.
    const light = section("html:not(.dark),html.dark .force-light");
    const dark = section("html.dark,html:not(.dark) .force-dark");
    for (const name of ["--neutral-150", "--neutral-450"]) {
      expect(declared(light, name), `light ${name}`).toBeUndefined();
      expect(declared(dark, name), `dark ${name}`).toBeUndefined();
    }
  });

  it("declares all ten Crixet Sans faces", () => {
    expect(css.match(/font-family: "Crixet Sans"/g)).toHaveLength(10);
  });

  it("declares the brand and status palettes", () => {
    const root = section(":root");
    expect(declared(root, "--brand-500")).toBe("#81d6ee");
    expect(declared(root, "--red-500")).toBe("#ff3d2f");
    expect(declared(root, "--orange-500")).toBe("#ffb200");
  });
});