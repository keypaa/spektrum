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