import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "./index";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{2BFF}]/u;

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
      expect(html, name).toContain('stroke="currentColor"');
      expect(html, name).not.toMatch(/(fill|stroke)="#/);
    }
  });

  it("contains no emoji or unicode glyph used as an icon", () => {
    for (const [name, Icon] of Object.entries(icons)) {
      expect(renderToStaticMarkup(<Icon />), name).not.toMatch(EMOJI);
    }
  });
});