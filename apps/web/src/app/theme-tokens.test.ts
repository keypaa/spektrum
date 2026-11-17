// @vitest-environment node
// A colour utility whose token is missing from the Tailwind `@theme` block is
// silently dropped: the class is valid-looking, the CSS is never generated, and
// the element falls back to whatever it inherits. Nothing in jsdom or the type
// system notices.
//
// That is exactly how the Settings switches shipped with no track and an
// invisible thumb (`bg-switch-bg-off`, `bg-switch-handle-off` were unmapped),
// and how six `role="alert"` messages rendered in the body colour instead of
// red (`text-fg-error`). This test walks the source and asserts every
// `bg-/text-/border-/…` utility naming a design token resolves to a mapping.
import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");

const tokens = new Set(
  [...readFileSync(resolve(root, "packages/ui/styles/tokens.css"), "utf8").matchAll(
    /^\s*--([a-z0-9-]+):/gm,
  )].map((match) => match[1]!),
);

const mapped = new Set([
  ...[...readFileSync(resolve(root, "apps/web/src/app/globals.css"), "utf8").matchAll(
    /--color-([a-z0-9-]+):/g,
  )].map((match) => match[1]!),
  // Tailwind's own palette keywords, which need no mapping.
  "black",
  "white",
  "transparent",
  "current",
  "inherit",
]);

/** Utility prefixes whose suffix is interpreted as a colour. */
const COLOUR_UTILITY =
  /(?<![\w-])(bg|text|border|ring|fill|stroke|divide|outline|accent|caret|placeholder)-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)/g;

const sources = globSync(["apps/web/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"], {
  cwd: root,
}).filter((file) => !/\.test\.(ts|tsx)$/.test(file));

describe("design tokens", () => {
  it("maps every design token that the source uses as a colour", () => {
    const unmapped: string[] = [];

    for (const file of sources) {
      const text = readFileSync(resolve(root, file), "utf8");
      for (const match of text.matchAll(COLOUR_UTILITY)) {
        const name = match[2]!;
        if (mapped.has(name)) continue;
        if (!tokens.has(name)) continue; // not a token: a normal utility (text-sm, border-b, …)
        unmapped.push(`${match[1]}-${name} in ${file}`);
      }
    }

    expect(unmapped, "these utilities generate no CSS; add --color-<token> to @theme").toEqual([]);
  });
});
