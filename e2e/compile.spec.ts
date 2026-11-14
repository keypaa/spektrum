import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const OWNER = { email: "owner@spektrum.local", password: "owner-password-123" };
const OTHER = { email: "other@spektrum.local", password: "other-password-123" };

interface EditorWindow {
  __spekrrum_editor?: { getValue(): string; setValue(value: string): void };
  __spekrrumResultAt?: number;
  __spekrrumStart?: number;
}

const win = (page: Page): Promise<EditorWindow> =>
  page.evaluate(() => window as unknown as EditorWindow);

async function openProject(page: Page): Promise<void> {
  await page.goto("/");
  await login(page);
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("monaco-editor")).toBeVisible();
  await page.waitForFunction(() =>
    Boolean((window as unknown as EditorWindow).__spekrrum_editor),
  );
}

async function type(page: Page, text: string): Promise<void> {
  await page.evaluate((value) => {
    const editor = (window as unknown as EditorWindow).__spekrrum_editor!;
    editor.setValue(editor.getValue() + value);
  }, text);
}

async function blur(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
}

async function waitResult(page: Page, timeout = 60_000): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as EditorWindow).__spekrrumResultAt !== undefined,
    undefined,
    { timeout },
  );
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
    await page.evaluate(() => {
      const editor = (window as unknown as EditorWindow).__spekrrum_editor!;
      editor.setValue(editor.getValue() + "warm");
    }, undefined);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect.poll(latestOk, { timeout: 60_000 }).toBe(true);

    const started = Date.now();
    await page.evaluate(() => {
      const editor = (window as unknown as EditorWindow).__spekrrum_editor!;
      editor.setValue(editor.getValue() + "2");
    }, undefined);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect.poll(latestOk, { timeout: 60_000, intervals: [100, 250, 500] }).toBe(true);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(3000);
  });

  test("a compile error lands in Logs at the right line", async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);
    const projectId = new URL(page.url()).pathname.split("/")[2]!;

    await page.evaluate(() => {
      const editor = (window as unknown as EditorWindow).__spekrrum_editor!;
      editor.setValue(editor.getValue() + "\n\\undefinedmacro");
    }, undefined);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));

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
    expect(
      await page.evaluate(
        () =>
          (window as unknown as EditorWindow).__spekrrum_editor?.getValue()
            .split("\n").length ?? 0,
      ),
    ).toBeGreaterThan(1);
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