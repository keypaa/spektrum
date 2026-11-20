import { expect, test } from "@playwright/test";
import { createBlankProject, login, OWNER_EMAIL } from "./helpers";
import { psql } from "./db";

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
  await createBlankProject(page);
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
  await createBlankProject(page);
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

test("switching tabs loads the other document's content", async ({ page }) => {
  // Two documents, two server round trips and an autosave on a shared dev
  // server that has already compiled the rest of the suite.
  test.setTimeout(120_000);
  await page.goto("/");
  await login(page);
  await createBlankProject(page);
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("project-sidebar")).toBeVisible();

  const edit = async (text: string) => {
    // The hook is set in the editor's create effect; wait for it.
    await page.waitForFunction(
      () => Boolean((window as unknown as Record<string, unknown>).__spektrum_editor),
    );
    await page.evaluate((t) => {
      const win = window as unknown as {
        __spektrum_editor: { getValue(): string; setValue(v: string): void };
      };
      const ed = win.__spektrum_editor;
      ed.setValue(ed.getValue() + t);
    }, text);
  };

  // Type into main.tex, then create notes.tex with distinct content.
  await edit("MAIN_MARKER");
  await page.getByRole("button", { name: "New file" }).click();
  const dialog = page.getByRole("dialog", { name: "New file" });
  await dialog.getByRole("textbox", { name: "File name" }).fill("notes");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toHaveCount(0);

  const editorText = () =>
    // A tab switch is an RSC navigation: the execution context is torn down
    // mid-poll. Treat that as "no value yet" and let the poll retry.
    page
      .evaluate(
        () =>
          document.querySelector("[data-testid='monaco-editor']")?.textContent ?? "",
      )
      .catch(() => "");

  // Wait for the tab switch to commit, not a fixed delay: the editor swaps to
  // an empty model for the new path synchronously with the selection, and a
  // fixed sleep races the fetch that fills it.
  await expect(page.getByTestId("tab-notes.tex")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect.poll(editorText).toBe("");
  await edit("NOTES_MARKER");

  // Switch back to main.tex: its content must load, not an empty buffer.
  await page.getByTestId("tab-main.tex").click({ timeout: 20_000 });
  await expect.poll(editorText, { timeout: 20_000 }).toContain("MAIN_MARKER");
  // And back to notes.tex.
  await page.getByTestId("tab-notes.tex").click({ timeout: 20_000 });
  await expect.poll(editorText, { timeout: 20_000 }).toContain("NOTES_MARKER");
});

test("an edit autosaves and survives a reload", async ({ page }) => {
  await page.goto("/");
  await login(page);
  await createBlankProject(page);
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
  await createBlankProject(page);
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
  const saved = page.waitForResponse(
    (r) => r.url().includes("/documents/") && r.request().method() === "PATCH",
    { timeout: 10_000 },
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await saved;
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

test("settings: a preference persists across a reload", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await login(page);
  await createBlankProject(page);
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("project-sidebar")).toBeVisible();

  await page.getByRole("button", { name: /account$/i }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Disable Word Wrap")).toBeVisible();

  // Order-independent: flip whatever the current value is, then expect the
  // opposite after a reload (a previous run may have left it on).
  const sw = dialog.getByRole("switch", { name: "Disable Word Wrap" });
  const before = await sw.getAttribute("aria-checked");
  // Wait for the debounced PUT instead of sleeping: under load the request can
  // outlast any fixed delay, and reloading before it lands would read the old
  // value back.
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes("/api/user/preferences") && r.request().method() === "PUT",
  );
  await sw.click();
  const after = before === "true" ? "false" : "true";
  await page.waitForFunction(
    (expected) =>
      document
        .querySelector('[aria-label="Disable Word Wrap"]')
        ?.getAttribute("aria-checked") === expected,
    after,
  );
  await saved;
  await page.reload();
  await expect(page.getByTestId("project-sidebar")).toBeVisible();
  await page.getByRole("button", { name: /account$/i }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const reopened = page.getByRole("dialog", { name: "Settings" });
  await expect(reopened.getByText("Disable Word Wrap")).toBeVisible();
  await expect(
    reopened.getByRole("switch", { name: "Disable Word Wrap" }),
  ).toHaveAttribute("aria-checked", after);
});

test("the editor context menu opens on right-click and closes on Escape", async ({ page }) => {
  await page.goto("/");
  await login(page);
  await createBlankProject(page);
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("monaco-editor")).toBeVisible();

  const editor = page.getByTestId("monaco-editor");
  const box = await editor.boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 3, {
    button: "right",
  });
  const menu = page.getByRole("menu", { name: "Editor context menu" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Go to PDF" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "File Search" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{2BFF}]/u;

async function assertIconDom(page: import("@playwright/test").Page): Promise<void> {
  const result = await page.evaluate((emoji) => {
    const re = new RegExp(emoji, "u");
    const svgs = [...document.querySelectorAll("svg")]
      .filter((svg) => !svg.closest(".monaco-editor"))
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
}

test("the editor DOM has no emoji and only 16x16 currentColor icons", async ({ page }) => {
  await page.goto("/");
  await login(page);
  await createBlankProject(page);
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("editor-root")).toBeVisible();
  await assertIconDom(page);

  // Settings modal: chrome icons only (the modal has no Monaco surface).
  await page.getByRole("button", { name: /account$/i }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await assertIconDom(page);
});

test("hidden files disappear from the tree and stay hidden after reload", async ({ page }) => {
  await page.goto("/");
  await login(page);
  await createBlankProject(page);
  await page.getByRole("link", { name: "New Project" }).first().click();
  await expect(page.getByTestId("project-sidebar")).toBeVisible();

  // Hide *.aux in Settings → File Management.
  await page.getByRole("button", { name: /account$/i }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("button", { name: "File Management" }).click();
  await dialog.getByLabel("Hide files from file tree").fill("*.aux");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog.getByText("*.aux")).toBeVisible();
  await page.keyboard.press("Escape");

  // Create main.aux; it must not appear in the tree.
  await page.getByRole("button", { name: "New file" }).click();
  const newDialog = page.getByRole("dialog", { name: "New file" });
  await newDialog.getByRole("textbox", { name: "File name" }).fill("main.aux");
  await newDialog.getByRole("button", { name: "Create" }).click();
  await expect(newDialog).toHaveCount(0);
  await expect(page.getByTestId("file-row-main.aux")).toHaveCount(0);
  await expect(page.getByTestId("file-row-main.tex")).toBeVisible();

  // Still hidden after a reload (the preference is server-side).
  await page.reload();
  await expect(page.getByTestId("file-row-main.aux")).toHaveCount(0);
});
