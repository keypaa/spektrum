import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const OTHER = { email: "other@spektrum.local", password: "other-password-123" };

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

  test("another owner's render is 404", async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);
    const url = page.url();
    const projectId = new URL(url).pathname.split("/")[2]!;
    const latest = await page.request.get(
      `/api/projects/${projectId}/render/latest`,
    );
    const body = (await latest.json()) as {
      render: { revision: string } | null;
    };
    const revision = body.render?.revision;
    expect(revision).toBeTruthy();

    await page.goto("/");
    await login(page, OTHER);
    const response = await page.request.get(
      `/api/projects/${projectId}/render/${revision}/pdf`,
    );
    expect(response.status()).toBe(404);
  });
});