import { execFileSync } from "node:child_process";

export type Dataset = "light" | "dark" | "empty" | "editor" | "pdf";

/**
 * Re-seed the visual fixture. The seed is idempotent: it renames the owner,
 * deletes every project/folder, and inserts the deterministic dataset with
 * createdAt offsets from "now" so the relative-time strings are stable.
 */
export function seedVisualFixture(dataset: Dataset): void {
  execFileSync(
    "pnpm",
    ["--filter", "@spektrum/web", "visual:seed", dataset],
    { stdio: "inherit", env: process.env },
  );
}

/** The PDF/Logs baselines open the seeded project with an `ok` render. */
export function seedPdfFixture(): void {
  seedVisualFixture("pdf");
}

/** The editor baselines all open the single `New Project` / `main.tex` pair. */
export function seedEditorFixture(): void {
  seedVisualFixture("editor");
}

/** Add the AI thread/diff fixture on top of the editor dataset. */
export function seedAiFixture(): void {
  execFileSync(
    "pnpm",
    ["--filter", "@spektrum/web", "visual:ai-seed"],
    { stdio: "inherit", env: process.env },
  );
}