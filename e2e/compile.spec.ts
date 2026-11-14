import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

// Every case shares one owner/project; re-seed so (b)'s broken document and
// (a)'s edits cannot leak into the next test.
test.beforeEach(() => {
  execFileSync(
    "pnpm",
    ["--filter", "@spektrum/web", "exec", "tsx", "src/cli/e2e-seed.ts"],
    { stdio: "inherit", env: process.env },
  );
});

const OTHER = { email: "other@spektrum.local", password: "other-password-123" };

async function latestRender(
  page: Page,
  projectId: string,
): Promise<{ render: { status: string; isCurrent: boolean; revision: string } | null }> {
  const res = await page.request.get(
    `/api/projects/${projectId}/render/latest`,
  );
  return (await res.json()) as {
    render: { status: string; isCurrent: boolean; revision: string } | null;
  };
}

async function openProject(page: Page): Promise<void> {
  page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));
  await page.goto("/");
  await login(page);
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("monaco-editor")).toBeVisible();
  await expect(page.locator(".monaco-editor textarea")).toBeVisible();
}

async function type(page: Page, text: string): Promise<void> {
  await page.getByTestId("monaco-editor").click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

async function blur(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
}


test.describe("compile", () => {
  test("keystroke → PDF under 3 s (warm)", async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);
    const projectId = new URL(page.url()).pathname.split("/")[2]!;

    const latestOk = async (): Promise<boolean> => {
      const res = await page.request.get(
        `/api/projects/${projectId}/render/latest`,
      );
      const body = (await res.json()) as {
        render: { isCurrent: boolean; status: string } | null;
      };
      return Boolean(body.render?.isCurrent && body.render.status === "ok");
    };

    // Warm the pipeline (the first compile includes worker/container warm-up).
    await type(page, "warm");
    await blur(page);
    await expect.poll(latestOk, { timeout: 60_000 }).toBe(true);

    const started = Date.now();
    await type(page, "2");
    await blur(page);
    await expect.poll(latestOk, { timeout: 60_000, intervals: [100, 250, 500] }).toBe(true);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(3000);
  });

  test("a compile error lands in Logs at the right line", async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);
    const projectId = new URL(page.url()).pathname.split("/")[2]!;

    await type(page, "\n\\undefinedmacro");
    await page.keyboard.press("Control+S");
    await blur(page);

    // Wait for the render row to record the error, then reload so the RSC
    // ships the diagnostics (the SSE stream is not observable from Playwright).
    await expect
      .poll(
        async () => {
          const res = await page.request.get(
            `/api/projects/${projectId}/render/latest`,
          );
          const body = (await res.json()) as {
            render: { status: string } | null;
          };
          return body.render?.status;
        },
        { timeout: 60_000 },
      )
      .toBe("error");
    await page.reload();
    await expect(page.getByTestId("monaco-editor")).toBeVisible();

    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("menuitem", { name: "Logs" }).click();
    await expect(page.getByTestId("info-panel")).toBeVisible();

    const card = page.getByRole("button", {
      name: /Undefined control sequence/,
    });
    await expect(card).toBeVisible();
    await card.click();
    await expect
      .poll(() => page.locator(".current-line").first().textContent(), {
        timeout: 10_000,
      })
      .toContain("undefinedmacro");
  });

  test("a newer edit supersedes the running compile", async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);
    const projectId = new URL(page.url()).pathname.split("/")[2]!;
    const ok = async (): Promise<boolean> =>
      (await latestRender(page, projectId)).render?.status === "ok";

    // Start a compile, then immediately supersede it with a newer edit.
    await type(page, "1");
    await blur(page);
    await type(page, "2");
    await blur(page);
    await expect.poll(ok, { timeout: 60_000 }).toBe(true);

    // The final render is the newest revision the server computes for the
    // current content (not the superseded one).
    const revision = await page.evaluate(async (id) => {
      const res = await fetch(`/api/projects/${id}/compile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mainFile: "main.tex" }),
      });
      return ((await res.json()) as { revision: string }).revision;
    }, projectId);
    const latest = await latestRender(page, projectId);
    expect(latest.render?.revision).toBe(revision);
    expect(latest.render?.isCurrent).toBe(true);
  });

  test("a failing compile keeps the last good PDF", async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);
    const projectId = new URL(page.url()).pathname.split("/")[2]!;
    // The realtime compile on open produces the first good PDF.
    await expect(
      page.locator("[data-testid='pdf-viewport'] canvas").first(),
    ).toBeVisible({ timeout: 60_000 });

    await type(page, "\n\\undefinedmacro");
    await page.keyboard.press("Control+S");
    await blur(page);
    await expect
      .poll(async () => (await latestRender(page, projectId)).render?.status, {
        timeout: 60_000,
      })
      .toBe("error");

    await expect(page.getByText("Failed")).toBeVisible();
    // The last good PDF is still rendered (the viewer keeps the old pdfUrl).
    await expect(
      page.locator("[data-testid='pdf-viewport'] canvas").first(),
    ).toBeVisible();
  });

  test("a 20-page document compiles in under 8 s", async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);
    const projectId = new URL(page.url()).pathname.split("/")[2]!;

    const started = Date.now();
    const body = await page.evaluate(async (id) => {
      const res = await fetch(`/api/projects/${id}/compile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mainFile: "long.tex" }),
      });
      if (!res.ok) throw new Error(`compile ${res.status}`);
      return (await res.json()) as { revision: string };
    }, projectId);
    await expect
      .poll(
        async () => {
          const latest = await latestRender(page, projectId);
          return latest.render?.revision === body.revision &&
            latest.render.status === "ok"
            ? "ok"
            : latest.render?.status;
        },
        { timeout: 60_000 },
      )
      .toBe("ok");
    expect(Date.now() - started).toBeLessThan(8000);
  });

  test("the two-tab conflict reloads the losing tab", async ({ page, context }) => {
    test.setTimeout(120_000);
    await openProject(page);
    const projectId = new URL(page.url()).pathname.split("/")[2]!;

    const second = await context.newPage();
    await second.goto(`/u/${projectId}?p=main.tex`);
    await second.getByTestId("monaco-editor").click();
    await expect(second.locator(".monaco-editor textarea")).toBeVisible();

    // Tab A saves "AAA".
    await type(page, "AAA");
    await blur(page);
    await expect
      .poll(async () => (await latestRender(page, projectId)).render?.status, {
        timeout: 60_000,
      })
      .toBe("ok");

    // Tab B types "BBB" and saves: it loses, and must reload A's content.
    await type(second, "BBB");
    await second.keyboard.press("Control+S");
    await second.waitForTimeout(1500);
    await expect
      .poll(async () =>
        second.locator(".monaco-editor").textContent(),
      )
      .toContain("AAA");
    await expect(
      second.locator(".monaco-editor").textContent(),
    ).not.toContain("BBB");
    await second.close();
  });

  test("another owner's render is 404", async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);
    const url = page.url();
    const projectId = new URL(url).pathname.split("/")[2]!;
    const latest = await page.request.get(
      `/api/projects/${projectId}/render/latest`,
    );
    const body = (await latest.json()) as {
      render: { lastOkRevision: string | null } | null;
    };
    const revision = body.render?.lastOkRevision;
    expect(revision).toBeTruthy();

    await page.goto("/");
    await login(page, OTHER);
    const response = await page.request.get(
      `/api/projects/${projectId}/render/${revision}/pdf`,
    );
    expect(response.status()).toBe(404);
  });
});