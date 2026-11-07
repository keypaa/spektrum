import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "./index";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{2BFF}]/u;

const STROKED = [
  "IconSearch",
  "IconWarning",
  "IconError",
  "IconInfo",
  "IconCheck",
  "IconClose",
  "IconChevronDown",
  "IconChevronRight",
] as const;

describe("icon registry", () => {
  it("exports components named Icon*", () => {
    for (const [name, value] of Object.entries(icons)) {
      expect(name, name).toMatch(/^Icon[A-Z]/);
      expect(typeof value, name).toBe("function");
    }
  });

  it("uses a 16x16 viewBox and currentColor only", () => {
    for (const [name, Icon] of Object.entries(icons)) {
      const html = renderToStaticMarkup(<Icon />);
      expect(html, name).toContain('viewBox="0 0 16 16"');
      expect(html, name).not.toMatch(/(fill|stroke)="#/);
      expect(html, name).not.toMatch(/(fill|stroke)="(?!currentColor|none)/);
    }
  });

  it("stroked icons are fill=none, stroke=currentColor, 1.5px, round caps", () => {
    for (const name of STROKED) {
      const Icon = (icons as Record<string, React.ComponentType>)[name]!;
      const html = renderToStaticMarkup(<Icon />);
      expect(html, name).toContain('fill="none"');
      expect(html, name).toContain('stroke="currentColor"');
      expect(html, name).toContain('stroke-width="1.5"');
      expect(html, name).toContain('stroke-linecap="round"');
      expect(html, name).toContain('stroke-linejoin="round"');
    }
  });

  it("IconBrand is a solid fill-only mark (no stroke)", () => {
    const html = renderToStaticMarkup(<icons.IconBrand />);
    expect(html).toContain('fill="currentColor"');
    expect(html).not.toContain("stroke=");
  });

  it("severity icons carry a <title>", () => {
    for (const name of ["IconWarning", "IconError", "IconInfo"] as const) {
      const Icon = icons[name];
      expect(renderToStaticMarkup(<Icon />), name).toMatch(/<title>.+<\/title>/);
    }
  });

  it("contains no emoji or unicode glyph used as an icon", () => {
    for (const [name, Icon] of Object.entries(icons)) {
      expect(renderToStaticMarkup(<Icon />), name).not.toMatch(EMOJI);
    }
  });
});
