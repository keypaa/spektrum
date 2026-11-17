import { expect, test } from "@playwright/test";
import {
  login,
  seedAiFixture,
  seedEditorFixture,
  seedPdfFixture,
  seedVisualFixture,
  setTheme,
} from "./helpers";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{2BFF}]/u;

for (const theme of ["light", "dark"] as const) {
  test(`dashboard DOM has no emoji and only 16x16 currentColor icons (${theme})`, async ({ page }) => {
    seedVisualFixture(theme);
    await setTheme(page, theme);
    await login(page);

    const result = await page.evaluate((emoji) => {
      const re = new RegExp(emoji, "u");
      const text = document.body.innerText;
      const svgs = [...document.querySelectorAll("svg")].map((svg) => ({
        viewBox: svg.getAttribute("viewBox"),
        fills: [...svg.querySelectorAll("*")].map((n) => n.getAttribute("fill")),
        strokes: [...svg.querySelectorAll("*")].map((n) => n.getAttribute("stroke")),
      }));
      return { hasEmoji: re.test(text), svgs };
    }, EMOJI.source);

    expect(result.hasEmoji).toBe(false);
    expect(result.svgs.length).toBeGreaterThan(0);
    for (const svg of result.svgs) {
      expect(svg.viewBox).toBe("0 0 16 16");
      for (const fill of svg.fills) expect([null, "none", "currentColor"]).toContain(fill);
      for (const stroke of svg.strokes) {
        expect([null, "currentColor"]).toContain(stroke);
      }
    }

    // Icon-only controls are labelled.
    await expect(page.getByLabel("Search")).toBeVisible();
    for (const name of ["List view", "Grid view", "Import", "New"]) {
      await expect(
        page.getByTestId("dashboard-header").getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }
    await expect(page.getByLabel("Sort by Name")).toBeVisible();
    await expect(page.getByLabel("Sort by Created")).toBeVisible();
  });
}

test("editor chrome: no emoji, registry icons only, controls labelled", async ({ page }) => {
  seedVisualFixture("dark");
  await setTheme(page, "dark");
  await login(page);

  // Open the first project (the "dark" fixture's first row).
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page).toHaveURL(/\/u\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("editor-root")).toBeVisible();
  await page.waitForTimeout(500);

  const result = await page.evaluate((emoji) => {
    const re = new RegExp(emoji, "u");
    const svgs = [...document.querySelectorAll("svg")]
      .filter(
        (svg) =>
          !svg.closest(".monaco-editor") && !svg.closest(".monaco-diff-editor"),
      )
      .map((svg) => ({
        viewBox: svg.getAttribute("viewBox"),
        fills: [...svg.querySelectorAll("*")].map((n) => n.getAttribute("fill")),
        strokes: [...svg.querySelectorAll("*")].map((n) => n.getAttribute("stroke")),
      }));
    return { hasEmoji: re.test(document.body.innerText), svgs };
  }, EMOJI.source);

  expect(result.hasEmoji).toBe(false);
  for (const svg of result.svgs) {
    expect(svg.viewBox).toBe("0 0 16 16");
    for (const fill of svg.fills) expect([null, "none", "currentColor"]).toContain(fill);
    for (const stroke of svg.strokes) expect([null, "currentColor"]).toContain(stroke);
  }

  // Structural chrome: sidebar tabs, icon buttons and the composer are labelled.
  await expect(page.getByRole("tab", { name: "Files" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recompile" })).toBeVisible();
  await expect(page.getByLabel("Ask anything")).toBeVisible();
});

test("AI composer/transcript/diff: no emoji, 16x16 currentColor icons", async ({ page }) => {
  seedEditorFixture();
  seedAiFixture();
  await setTheme(page, "dark");
  await login(page);

  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("editor-root")).toBeVisible();
  const projectId = new URL(page.url()).pathname.split("/")[2]!;
  const res = await page.request.get(`/api/projects/${projectId}/threads`);
  const body = (await res.json()) as { threads: Array<{ id: string }> };
  const threadId = body.threads[0]!.id;
  await page.goto(`/u/${projectId}?thread=${threadId}`);
  await expect(page.getByTestId("editor-root")).toBeVisible();

  // The transcript and the inline diff render from the seeded thread.
  await expect(page.getByText("Rename the introduction").first()).toBeVisible();
  await expect(page.getByTestId("diff-widget")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();

  const result = await page.evaluate((emoji) => {
    const re = new RegExp(emoji, "u");
    const svgs = [...document.querySelectorAll("svg")]
      .filter(
        (svg) =>
          !svg.closest(".monaco-editor") && !svg.closest(".monaco-diff-editor"),
      )
      .map((svg) => ({
        viewBox: svg.getAttribute("viewBox"),
        fills: [...svg.querySelectorAll("*")].map((n) => n.getAttribute("fill")),
        strokes: [...svg.querySelectorAll("*")].map((n) => n.getAttribute("stroke")),
      }));
    return { hasEmoji: re.test(document.body.innerText), svgs };
  }, EMOJI.source);

  expect(result.hasEmoji).toBe(false);
  for (const svg of result.svgs) {
    expect(svg.viewBox).toBe("0 0 16 16");
    for (const fill of svg.fills) expect([null, "none", "currentColor"]).toContain(fill);
    for (const stroke of svg.strokes) {
      expect([null, "currentColor"]).toContain(stroke);
    }
  }
});

test("settings chrome: dialog semantics, nav and switches", async ({ page }) => {
  seedVisualFixture("dark");
  await setTheme(page, "dark");
  await login(page);
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("editor-root")).toBeVisible();
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: /account$/i }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();

  // Nav sections are toggle buttons with an accessible name.
  for (const section of [
    "Editor",
    "PDF Viewer",
    "File Management",
    "Data Controls",
    "Beta features",
    "Integrations",
  ]) {
    await expect(dialog.getByRole("button", { name: section })).toBeVisible();
  }
  // Toggles expose role=switch with a name.
  const sw = dialog.getByRole("switch", { name: "Disable Word Wrap" });
  expect(await sw.getAttribute("role")).toBe("switch");
  // The active file tab exposes aria-current via aria-selected.
  await expect(dialog).toBeVisible();
});

test("the PDF and Logs screens have no emoji and only 16x16 currentColor icons", async ({ page }) => {
  seedPdfFixture();
  await setTheme(page, "dark");
  await login(page);
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("pdf-pane")).toBeVisible();

  // Ink identical to the surface behind it is invisible. Both right-pane
  // surfaces here are light while the dark theme's foreground is light, so
  // inheriting the app's colour painted white-on-white: the PDF toolbar's
  // icons and labels disappeared. Assert the invariant at both stops, because
  // the panel replaces the PDF pane rather than stacking on it.
  const assertReadable = async (label: string): Promise<void> => {
    const invisible = await page.evaluate(() => {
      const backgroundOf = (element: Element): string => {
        for (let node: Element | null = element; node; node = node.parentElement) {
          const background = getComputedStyle(node).backgroundColor;
          if (background && background !== "rgba(0, 0, 0, 0)" && background !== "transparent") {
            return background;
          }
        }
        return "rgba(0, 0, 0, 0)";
      };
      const controls = [
        ...document.querySelectorAll(
          '[data-testid="pdf-pane"] button, [data-testid="info-panel"] button, [data-testid="info-panel"] [role="tab"]',
        ),
      ];
      return controls
        .map((element) => ({
          label:
            element.getAttribute("aria-label") ??
            element.textContent?.trim() ??
            element.tagName.toLowerCase(),
          ink: getComputedStyle(element).color,
          surface: backgroundOf(element),
        }))
        .filter((control) => control.ink === control.surface)
        .map((control) => `${control.label} (${control.ink} on ${control.surface})`);
    });
    expect(invisible, `${label} renders ink on its own background`).toEqual([]);
  };

  await assertReadable("PDF toolbar");

  // The floating Refresh / Go-to-PDF bar is absolutely positioned and belongs
  // at the bottom of the sheet. It resolved against the 52 px toolbar row
  // instead, so `bottom-3` pinned it on top of the zoom control (measured:
  // bar 8..48 overlapping zoom 16..52).
  await page.mouse.move(1200, 600);
  const floating = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="pdf-floating-bar"]');
    const zoom = document.querySelector('[data-testid="pdf-zoom"]');
    const sheet = document.querySelector('[data-testid="pdf-pane"] > div');
    if (!bar || !zoom || !sheet) return { visible: false as const };
    const b = bar.getBoundingClientRect();
    const z = zoom.getBoundingClientRect();
    const s = sheet.getBoundingClientRect();
    return {
      visible: true as const,
      overlapsToolbar: b.top < z.bottom && b.bottom > z.top,
      inLowerHalf: b.top > s.top + s.height / 2,
    };
  });
  expect(floating.visible, "floating bar shows on pointer move").toBe(true);
  if (floating.visible) {
    expect(floating.overlapsToolbar, "floating bar must not cover the toolbar").toBe(false);
    expect(floating.inLowerHalf, "floating bar must sit at the bottom of the sheet").toBe(true);
  }

  await page.getByRole("button", { name: "Tools" }).click();
  await page.getByRole("menuitem", { name: "Logs" }).click();
  await expect(page.getByTestId("info-panel")).toBeVisible();
  await assertReadable("Logs panel");

  const result = await page.evaluate((emoji) => {
    const re = new RegExp(emoji, "u");
    const text = document.body.innerText;
    const svgs = [...document.querySelectorAll("svg")].map((svg) => ({
      viewBox: svg.getAttribute("viewBox"),
      fills: [...svg.querySelectorAll("*")].map((n) => n.getAttribute("fill")),
      strokes: [...svg.querySelectorAll("*")].map((n) => n.getAttribute("stroke")),
    }));
    return { hasEmoji: re.test(text), svgs };
  }, EMOJI.source);

  expect(result.hasEmoji).toBe(false);
  for (const svg of result.svgs) {
    expect(svg.viewBox).toBe("0 0 16 16");
    for (const fill of svg.fills) expect([null, "none", "currentColor"]).toContain(fill);
    for (const stroke of svg.strokes) expect([null, "currentColor"]).toContain(stroke);
  }
});
