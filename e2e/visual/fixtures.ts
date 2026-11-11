import { execFileSync } from "node:child_process";

export type Dataset = "light" | "dark" | "empty";

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
