import { expect, test } from "@playwright/test";
import { login, OWNER_EMAIL } from "./helpers";
import { psql } from "./db";


function resetOwnerState(): void {
  psql(`
    DELETE FROM projects
    WHERE owner_id = (SELECT id FROM users WHERE email = '${OWNER_EMAIL}');
    DELETE FROM folders
    WHERE owner_id = (SELECT id FROM users WHERE email = '${OWNER_EMAIL}');
  `);
}

function seedProject(name: string, createdAtSql = "now()"): void {
  const escaped = name.replace(/'/g, "''");
  psql(`
    INSERT INTO projects (owner_id, name, created_at)
    SELECT id, '${escaped}', ${createdAtSql}
    FROM users WHERE email = '${OWNER_EMAIL}';
  `);
}

function folderCount(name: string): number {
  const escaped = name.replace(/'/g, "''");
  const out = psql(`
    SELECT COUNT(*) FROM folders f
    JOIN users u ON u.id = f.owner_id
    WHERE u.email = '${OWNER_EMAIL}' AND f.name = '${escaped}';
  `);
  return Number(out || "0");
}


test.beforeEach(() => {
  resetOwnerState();
});

test("search filters the list", async ({ page }) => {
  seedProject("Alpha Project", "now() - interval '2 days'");
  seedProject("Beta Project", "now() - interval '1 day'");
  await login(page);

  await expect(page.locator('[data-testid^="project-card-"]')).toHaveCount(2);
  await page.getByLabel("Search").fill("Alpha");
  await expect(page.locator('[data-testid^="project-card-"]')).toHaveCount(1);
  await expect(page.getByText("Alpha Project")).toBeVisible();
  await expect(page.getByText("Beta Project")).toHaveCount(0);

  await page.getByLabel("Search").fill("");
  await expect(page.locator('[data-testid^="project-card-"]')).toHaveCount(2);
});

test("sorting by name re-orders and flips", async ({ page }) => {
  seedProject("Mango", "now() - interval '3 days'");
  seedProject("Zulu", "now() - interval '2 days'");
  seedProject("Alpha", "now() - interval '1 day'");
  await login(page);

  const names = page.locator(
    '[data-testid^="project-card-"] .truncate.text-sm.text-text-nav-primary',
  );

  await page.getByLabel("Sort by Name").click();
  await expect(names).toHaveText(["Zulu", "Mango", "Alpha"]);

  await page.getByLabel("Sort by Name").click();
  await expect(names).toHaveText(["Alpha", "Mango", "Zulu"]);
});

test("the layout toggle switches list and grid", async ({ page }) => {
  seedProject("Layout Sample", "now()");
  await login(page);

  await expect(page.getByTestId("project-list-header")).toBeVisible();
  await expect(page.getByRole("button", { name: "List view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Grid view" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await page.getByRole("button", { name: "Grid view" }).click();
  await expect(page.getByTestId("project-list-header")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Grid view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "List view" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.locator('[data-testid^="project-card-"]')).toHaveCount(1);

  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.getByTestId("project-list-header")).toBeVisible();
  await expect(page.getByRole("button", { name: "List view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the New menu creates a blank project", async ({ page }) => {
  await login(page);

  await expect(page.locator('[data-testid^="project-card-"]')).toHaveCount(0);
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "Blank project" }).click();

  await expect(page.locator('[data-testid^="project-card-"]')).toHaveCount(1);
  await expect(page.getByText("New Project", { exact: true })).toBeVisible();
});

test("the New folder dialog creates a folder", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "New folder" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "New folder" }).fill("Behaviour Test Folder");
  await page.getByRole("button", { name: "Create folder" }).click();
  await expect(dialog).toHaveCount(0);

  await expect.poll(() => folderCount("Behaviour Test Folder")).toBe(1);
});

test("rename changes the row's name", async ({ page }) => {
  seedProject("Original Name", "now()");
  await login(page);

  await page.getByRole("button", { name: "Original Name actions" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();

  await expect(page.getByRole("dialog")).toBeVisible();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Edit project name" }).fill("Renamed Name");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Renamed Name", { exact: true })).toBeVisible();
  await expect(page.getByText("Original Name", { exact: true })).toHaveCount(0);
});

test("duplicate adds a Copy of row", async ({ page }) => {
  seedProject("Alpha", "now()");
  await login(page);

  await page.getByRole("button", { name: "Alpha actions" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();

  await expect(page.getByText("Copy of Alpha", { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="project-card-"]')).toHaveCount(2);
});

test("delete removes the row immediately with no confirmation dialog", async ({ page }) => {
  seedProject("Disposable", "now()");
  await login(page);

  await expect(page.locator('[data-testid^="project-card-"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Disposable actions" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Delete" }).click();

  await expect(page.locator('[data-testid^="project-card-"]')).toHaveCount(0);
  await expect(page.getByText("Disposable", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the shutdown banner is absent by default on port 3000", async ({ page }) => {
  await login(page);
  await expect(page.getByTestId("shutdown-banner")).toHaveCount(0);
});

test("the account menu signs out and lands on /login", async ({ page }) => {
  await login(page);

  await page.getByTestId("account-chip").click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/login/);
});

test("a project name opens the editor", async ({ page }) => {
  await login(page);

  // Blank project via the New menu seeds main.tex with the blank template.
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "Blank project" }).click();
  await expect(page.getByText("New Project", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "New Project" }).click();
  await expect(page).toHaveURL(/\/u\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("editor-root")).toBeVisible();
  await expect(page.getByRole("tab", { name: "main.tex" })).toBeVisible();
  // Monaco actually loaded in the browser (the worker path works).
  await expect(page.getByTestId("monaco-editor")).toBeVisible();
});
