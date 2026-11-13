import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { login, OWNER_EMAIL } from "./helpers";

function psql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "spektrum-postgres",
      "psql",
      "-U",
      "spektrum",
      "-d",
      "spektrum_test",
      "-v",
      "ON_ERROR_STOP=1",
      "-tAc",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

function resetOwnerState(): void {
  psql(`
    DELETE FROM projects
    WHERE owner_id = (SELECT id FROM users WHERE email = '${OWNER_EMAIL}');
    DELETE FROM folders
    WHERE owner_id = (SELECT id FROM users WHERE email = '${OWNER_EMAIL}');
  `);
}

function documentCount(): number {
  return Number(
    psql(`
      SELECT COUNT(*) FROM documents d
      JOIN projects p ON p.id = d.project_id
      WHERE p.owner_id = (SELECT id FROM users WHERE email = '${OWNER_EMAIL}');
    `),
  );
}

test.beforeEach(() => {
  resetOwnerState();
});

test("create a file, reload, rename it, delete it", async ({ page }) => {
  await page.goto("/");
  await login(page);
  // A blank project seeds main.tex.
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "Blank project" }).click();
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("project-sidebar")).toBeVisible();

  // Create notes.tex through the + action.
  await page.getByRole("button", { name: "New file" }).click();
  const dialog = page.getByRole("dialog", { name: "New file" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "File name" }).fill("notes");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("file-row-notes.tex")).toBeVisible();
  await expect(page).toHaveURL(/p=notes\.tex/);

  // Survives a reload.
  await page.reload();
  await expect(page.getByTestId("file-row-notes.tex")).toBeVisible();

  // Rename it through the row menu.
  await page.getByRole("button", { name: "notes.tex actions" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const renameDialog = page.getByRole("dialog", { name: "Rename file" });
  await expect(renameDialog).toBeVisible();
  const renameInput = renameDialog.getByRole("textbox", { name: "File name" });
  await renameInput.fill("notes2.tex");
  await renameDialog.getByRole("button", { name: "Save" }).click();
  await expect(renameDialog).toHaveCount(0);
  await expect(page.getByTestId("file-row-notes2.tex")).toBeVisible();
  await expect(page.getByTestId("file-row-notes.tex")).toHaveCount(0);
  await expect(page).toHaveURL(/p=notes2\.tex/);

  // Delete it.
  await page.getByRole("button", { name: "notes2.tex actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete file" });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole("button", { name: "Delete" }).click();
  await expect(deleteDialog).toHaveCount(0);
  await expect(page.getByTestId("file-row-notes2.tex")).toHaveCount(0);

  // The project now has only the seeded main.tex.
  await page.reload();
  expect(documentCount()).toBe(1);
  await expect(page.getByTestId("file-row-main.tex")).toBeVisible();
});
test("tabs survive a reload with the last active tab", async ({ page }) => {
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "Blank project" }).click();
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("project-sidebar")).toBeVisible();

  // Create a second file so there are two tabs.
  await page.getByRole("button", { name: "New file" }).click();
  const dialog = page.getByRole("dialog", { name: "New file" });
  await dialog.getByRole("textbox", { name: "File name" }).fill("notes");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("tab-notes.tex")).toBeVisible();

  // Activate main.tex, then reload: both tabs restore with main.tex active.
  await expect(page.getByTestId("tab-main.tex")).toBeVisible();
  await page.getByTestId("tab-main.tex").click();
  await expect(page).toHaveURL(/p=main\.tex/);
  await page.reload();

  await expect(page.getByTestId("tab-main.tex")).toBeVisible();
  await expect(page.getByTestId("tab-notes.tex")).toBeVisible();
  await expect(page.getByTestId("tab-main.tex")).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("an edit autosaves and survives a reload", async ({ page }) => {
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "Blank project" }).click();
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("monaco-editor")).toBeVisible();

  // Type through the editor's own API: the model's content-change fires the
  // same onChange path a keystroke takes (Playwright cannot click Monaco's
  // transparent textarea in this environment).
  await page.evaluate(() => {
    const win = window as unknown as {
      __spektrum_editor: { getValue(): string; setValue(v: string): void };
    };
    const ed = win.__spektrum_editor;
    ed.setValue(ed.getValue() + "AUTOSAVE_MARKER\n");
  });
  await page.waitForTimeout(900);
  await page.reload();
  await expect(page.getByTestId("monaco-editor")).toBeVisible();
  const value = await page.evaluate(() => {
    const win = window as unknown as {
      __spektrum_editor: { getValue(): string };
    };
    return win.__spektrum_editor.getValue();
  });
  expect(value).toContain("AUTOSAVE_MARKER");
});

test("an edit then a focus loss persists after reload", async ({ page }) => {
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "Blank project" }).click();
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("monaco-editor")).toBeVisible();

  await page.evaluate(() => {
    const win = window as unknown as {
      __spektrum_editor: { getValue(): string; setValue(v: string): void };
    };
    const ed = win.__spektrum_editor;
    ed.setValue(ed.getValue() + "FLUSH_MARKER");
  });
  // Leaving the editor flushes immediately (blur), before the debounce.
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByTestId("monaco-editor")).toBeVisible();
  const value = await page.evaluate(() => {
    const win = window as unknown as {
      __spektrum_editor: { getValue(): string };
    };
    return win.__spektrum_editor.getValue();
  });
  expect(value).toContain("FLUSH_MARKER");
});
