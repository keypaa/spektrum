// @vitest-environment node
// Two imports at once would inflate two archives on the same event loop; the
// lock makes them queue instead.
import { describe, expect, it } from "vitest";
import { withImportLock } from "./import-archive";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("withImportLock", () => {
  it("never runs two tasks at the same time", async () => {
    let running = 0;
    let maxConcurrent = 0;
    const task = async () => {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      await delay(20);
      running -= 1;
    };

    await Promise.all([
      withImportLock(task),
      withImportLock(task),
      withImportLock(task),
    ]);

    expect(maxConcurrent).toBe(1);
  });

  it("keeps running after a task throws", async () => {
    await expect(
      withImportLock(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(withImportLock(async () => "ok")).resolves.toBe("ok");
  });
});