import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("app icon", () => {
  it("uses the sidebar logo mark on a transparent, full-bleed canvas", () => {
    const svg = readFileSync(new URL("./icon.svg", import.meta.url), "utf8");
    expect(svg).toContain("viewBox=\"0 0 48 48\"");
    expect(svg).toContain("M24 3 43 14v20L24 45 5 34V14z");
    expect(svg).toContain("#fff");
    expect(svg).not.toContain("#5fc6dd");
    expect(svg).not.toContain('width="64"');
  });
});
