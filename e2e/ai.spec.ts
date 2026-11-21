import { execFileSync } from "node:child_process";
import { expect, request as apiRequest, test, type Page } from "@playwright/test";
import { login } from "./helpers";

// Every case shares the seeded owner/member projects; re-seed (reset main.tex,
// delete notes.tex, clear chat threads) so the cases are independent.
test.beforeEach(() => {
  execFileSync(
    "pnpm",
    [
      "--filter",
      "@spektrum/web",
      "exec",
      "tsx",
      "src/cli/e2e-ai-seed.ts",
      "--reset",
    ],
    { stdio: "inherit", env: process.env },
  );
});

const OWNER_PROJECT = "AI Owner Project";
const MEMBER_PROJECT = "AI Member Project";
const OTHER = { email: "other@spektrum.local", password: "other-password-123" };

async function editorValue(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __spektrum_editor?: { getValue(): string };
        }
      ).__spektrum_editor?.getValue() ?? "",
  );
}

function docPatch(page: Page) {
  return page.waitForResponse(
    (res) =>
      res.url().includes("/documents/") && res.request().method() === "PATCH",
  );
}

async function openProject(
  page: Page,
  name: string,
  opts: { email?: string; password?: string } = {},
): Promise<string> {
  await page.goto("/");
  await login(page, opts);
  await page.getByRole("link", { name }).first().click();
  // The first load compiles the editor route + Monaco in dev; allow for it.
  await expect(page.getByTestId("monaco-editor")).toBeVisible({ timeout: 30_000 });
  const id = new URL(page.url()).pathname.split("/")[2]!;
  return id;
}

async function send(page: Page, text: string): Promise<void> {
  const box = page.getByLabel("Ask anything");
  await box.fill(text);
  await box.press("Enter");
}

test("(j) pinned file and selected lines reach the model", async ({ page }) => {
  await openProject(page, OWNER_PROJECT);

  await page.evaluate(() => {
    const editor = (
      window as unknown as {
        __spektrum_editor?: {
          setSelection(range: {
            startLineNumber: number;
            startColumn: number;
            endLineNumber: number;
            endColumn: number;
          }): void;
          focus(): void;
        };
      }
    ).__spektrum_editor;
    editor?.setSelection({
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 3,
      endColumn: 5,
    });
    editor?.focus();
  });
  await expect(page.getByTestId("selection-chip")).toContainText("2-3");

  const box = page.getByLabel("Ask anything");
  await box.fill("@bri");
  await page.getByRole("option", { name: /brief\.pdf/ }).click();
  await expect(page.getByTestId("pinned-file-chip")).toContainText("brief.pdf");

  const chatRequest = page.waitForRequest(
    (req) => req.url().includes("/chat") && req.method() === "POST",
  );
  await box.fill("check pinned context");
  await box.press("Enter");
  const body = (await chatRequest).postDataJSON() as {
    pinnedPaths?: string[];
    selection?: { path: string; startLine: number; endLine: number };
  };
  expect(body.pinnedPaths).toContain("brief.pdf");
  expect(body.selection).toEqual({
    path: "main.tex",
    startLine: 2,
    endLine: 3,
  });

  const mock = await apiRequest.newContext({ baseURL: "http://localhost:4010" });
  await expect
    .poll(async () => {
      const poll = await mock.get("/requests", {
        headers: { "x-ai-mock-token": "test-token" },
      });
      const rows = (await poll.json()) as unknown[];
      return rows.length;
    })
    .toBeGreaterThan(0);
  const res = await mock.get("/requests", {
    headers: { "x-ai-mock-token": "test-token" },
  });
  const recorded = (await res.json()) as Array<{
    body: { messages: Array<{ role: string; content: string }> };
  }>;
  const system = recorded
    .map((entry) => entry.body.messages[0]?.content ?? "")
    .join("\n");
  expect(system).toContain('<selection path="main.tex" lines="2-3">');
  expect(system).toContain("2| ");
  expect(system).toContain('<pdf path="brief.pdf"');
});

test("(a) send → accept applies the edit and survives a reload", async ({ page }) => {
  await openProject(page, OWNER_PROJECT);
  await send(page, "Rename the introduction");
  await expect(page.getByTestId("diff-widget")).toBeVisible();

  const patch = docPatch(page);
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  expect((await patch).status()).toBe(200);
  await expect.poll(() => editorValue(page)).toContain("\\section{Introduction}");

  await page.reload();
  await expect(page.getByTestId("monaco-editor")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => editorValue(page)).toContain("\\section{Introduction}");
});

test("(b) a stale proposal asks to re-run and hides Accept", async ({ page }) => {
  await openProject(page, OWNER_PROJECT);
  await send(page, "Rename the introduction");
  await expect(page.getByTestId("diff-widget")).toBeVisible();

  // The diff overlay covers the editor, so change the buffer through the editor
  // handle (the same path an external edit/autosave would take).
  await page.evaluate(() => {
    const editor = (
      window as unknown as {
        __spektrum_editor: { getValue(): string; setValue(value: string): void };
      }
    ).__spektrum_editor;
    editor.setValue(`${editor.getValue()} `);
  });

  await expect(
    page.getByText("The document changed since this suggestion — re-run?"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
});

test("(c) Fix with AI turns a diagnostic into an accepted edit", async ({ page }) => {
  await openProject(page, OWNER_PROJECT);

  await page.getByTestId("monaco-editor").click();
  await page.keyboard.press("End");
  await page.keyboard.type("\\broken{}");
  const save = docPatch(page);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await save;

  await page.getByRole("button", { name: "Tools" }).first().click();
  await page.getByRole("menuitem", { name: "Logs" }).click();
  await expect(page.getByRole("button", { name: "Fix with AI" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Fix with AI" }).first().click();

  await expect(page.getByTestId("diff-widget")).toBeVisible();
  const patch = docPatch(page);
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await patch;
  await expect.poll(() => editorValue(page)).toContain("\\textbf{fixed}");
});

test("(d) Review paper streams the referee reply", async ({ page }) => {
  await openProject(page, OWNER_PROJECT);
  await page.getByRole("button", { name: "Review paper" }).click();
  await expect(page.getByText("The paper is structurally sound.")).toBeVisible();
});

test("(e) the thread title falls back, then is generated, renamed and deleted", async ({ page }) => {
  await openProject(page, OWNER_PROJECT);
  await send(page, "Rename the introduction");
  await page.getByRole("tab", { name: "Chats" }).click();
  await expect(page.getByText("Fix the broken document")).toBeVisible();

  // Regenerate keeps a valid title and does not crash.
  await page.getByRole("button", { name: "Fix the broken document actions" }).click();
  await page.getByRole("menuitem", { name: "Regenerate title" }).click();
  await expect(page.getByText("Fix the broken document")).toBeVisible();

  // Rename persists through PATCH.
  await page.getByRole("button", { name: "Fix the broken document actions" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const input = page.getByLabel("Chat title");
  await input.fill("Renamed chat");
  await input.press("Enter");
  await expect(page.getByText("Renamed chat")).toBeVisible();

  // Delete removes the row after confirmation.
  await page.getByRole("button", { name: "Renamed chat actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No chats yet")).toBeVisible();
});

test("(f) a member without a key sees the disabled surface and a 403", async ({ page }) => {
  const projectId = await openProject(page, MEMBER_PROJECT, OTHER);
  await expect(page.getByText("Add your API key in Settings")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

  const res = await page.request.post(`/api/projects/${projectId}/chat`, {
    headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
    data: { message: "hi" },
  });
  expect(res.status()).toBe(403);
  expect(res.headers()["retry-after"]).toBeUndefined();
});

test("(g) a member cannot regenerate another owner's thread title", async ({ browser }) => {
  // Owner sends one turn so a thread exists after the reset.
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const projectId = await openProject(ownerPage, OWNER_PROJECT);
  await send(ownerPage, "Rename the introduction");
  const threadId = await expect
    .poll(() => new URL(ownerPage.url()).searchParams.get("thread"), {
      timeout: 30_000,
    })
    .not.toBeNull();

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await login(memberPage, OTHER);
  await expect(memberPage.getByRole("heading", { name: "Your Projects" })).toBeVisible();

  const res = await memberContext.request.post(
    `/api/projects/${projectId}/threads/${threadId}/title/regenerate`,
    {
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
    },
  );
  expect(res.status()).toBe(404);

  await ownerContext.close();
  await memberContext.close();
});

test("(h) the default turn maps Extra high to reasoning_effort and max_tokens", async ({ page }) => {
  const mock = await apiRequest.newContext({ baseURL: "http://localhost:4010" });
  await mock.delete("/requests", { headers: { "x-ai-mock-token": "test-token" } });

  await openProject(page, OWNER_PROJECT);
  await send(page, "Rename the introduction");
  await expect(page.getByTestId("diff-widget")).toBeVisible();

  const res = await mock.get("/requests", {
    headers: { "x-ai-mock-token": "test-token" },
  });
  const body = (await res.json()) as Array<{
    body: { reasoning_effort?: string; max_tokens?: number };
  }>;
  const turn = body.find((entry) => (entry.body.max_tokens ?? 0) > 64);
  expect(turn?.body.reasoning_effort).toBe("high");
  expect(turn?.body.max_tokens).toBe(64000);
});

test("(i) create and delete a file through proposals", async ({ page }) => {
  await openProject(page, OWNER_PROJECT);

  await send(page, "Create a notes file");
  await expect(page.getByTestId("diff-widget")).toBeVisible();
  const create = page.waitForResponse(
    (res) =>
      res.url().includes("/documents") && res.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await create;
  await expect(page.getByTestId("file-row-notes.tex")).toBeVisible();
  await expect.poll(async () => {
    await page.getByTestId("file-row-notes.tex").click();
    return editorValue(page);
  }).toContain("\\section{Notes}");

  await send(page, "Delete notes");
  await expect(page.getByTestId("diff-widget")).toBeVisible();
  const del = page.waitForResponse(
    (res) => res.request().method() === "DELETE",
  );
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  expect((await del).status()).toBeLessThan(300);
  await expect(page.getByTestId("file-row-notes.tex")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("file-row-notes.tex")).toHaveCount(0);
});