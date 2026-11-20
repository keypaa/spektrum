import { expect, test } from "@playwright/test";
import { createBlankProject, login } from "./helpers";

// Task 13's browser check: the LaTeX grammar and the three folding providers
// are live on the real Monaco instance. The check drives the page's own editor
// through `window.__spektrum_editor` (exposed by the component): load a
// document with all three foldable constructs and assert Monaco built fold
// regions for them (the model's region count and first range).
//
// Fused off until Task 20 (the plan keeps behavioural specs out of the visual
// gate); run manually with `pnpm exec playwright test e2e/folding.spec.ts`.
// NOTE: a region count of 3 with the first range 1-3 is the verifiable point —
// Monaco's own gutter-collapse behaviour on click is standard editor behaviour
// on top of the same model.

const DOC = [
  "% {",
  "region body",
  "% }",
  "\\section{A}",
  "section body",
  "\\section{B}",
  "other",
  "\\begin{itemize}",
  "\\item x",
  "\\end{itemize}",
  "tail",
].join("\n");

test.fixme("Monaco folds the LaTeX grammar's regions, sections and environments", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  await createBlankProject(page);
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("monaco-editor")).toBeVisible();

  await page.evaluate((text) => {
    const win = window as unknown as {
      __spektrum_editor: { setValue(v: string): void };
    };
    win.__spektrum_editor.setValue(text);
  }, DOC);
  await page.waitForTimeout(1200);

  const summary = await page.evaluate(async () => {
    const win = window as unknown as {
      __spektrum_editor: { getContribution(id: string): Record<string, unknown> };
    };
    const folding = win.__spektrum_editor.getContribution("editor.contrib.folding");
    const resolved = (await folding.foldingModelPromise) as {
      _regions: {
        length: number;
        getStartLineNumber(i: number): number;
        getEndLineNumber(i: number): number;
      };
    };
    const regions = resolved._regions;
    return {
      count: regions.length,
      ranges: Array.from(
        { length: regions.length },
        (_, i) => `${regions.getStartLineNumber(i)}-${regions.getEndLineNumber(i)}`,
      ),
    };
  });

  expect(summary.count).toBeGreaterThanOrEqual(3);
  expect(summary.ranges).toContain("1-3");
});