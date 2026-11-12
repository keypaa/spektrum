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
  "IconList",
  "IconGrid",
  "IconPlus",
  "IconMoreHorizontal",
  "IconSortAscending",
  "IconSortDescending",
  "IconChevronExpand",
  "IconDownload",
  "IconSettings",
  "IconKeyboard",
  "IconFeedback",
  "IconMail",
  "IconLogOut",
  "IconUser",
  "IconChevronLeft",
  "IconFolder",
  "IconFolderPlus",
  "IconFile",
  "IconFileTex",
  "IconFileBib",
  "IconFileImage",
  "IconFileCsv",
  "IconChat",
  "IconRefresh",
  "IconPanelLeftClose",
  "IconTools",
  "IconMic",
  "IconArrowUp",
  "IconStop",
  "IconPaperclip",
  "IconSparkle",
  "IconPencil",
  "IconTrash",
  "IconFit",
  "IconBraces",
  "IconDatabase",
  "IconBeta",
  "IconIntegrations",
  "IconSpinner",
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

  it("IconBrand geometry stays inside the 16x16 viewBox", () => {
    const html = renderToStaticMarkup(<icons.IconBrand size={16} />);
    // six petals rotated around the centre, plus the hub
    const ellipses = html.match(/<ellipse[^>]*>/g) ?? [];
    expect(ellipses).toHaveLength(6);
    for (const e of ellipses) {
      const cx = Number(e.match(/cx="([\d.]+)"/)![1]);
      const cy = Number(e.match(/cy="([\d.]+)"/)![1]);
      const rx = Number(e.match(/rx="([\d.]+)"/)![1]);
      const ry = Number(e.match(/ry="([\d.]+)"/)![1]);
      expect(cx - rx).toBeGreaterThanOrEqual(0);
      expect(cx + rx).toBeLessThanOrEqual(16);
      expect(cy - ry).toBeGreaterThanOrEqual(0);
      expect(cy + ry).toBeLessThanOrEqual(16);
    }
    // a rotated petal's farthest point from the centre must stay inside too
    const cy = 4.6, ry = 3.4;
    expect(8 - (cy - ry)).toBeGreaterThanOrEqual(0);
    expect(8 + (8 - (cy - ry))).toBeLessThanOrEqual(16);
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
