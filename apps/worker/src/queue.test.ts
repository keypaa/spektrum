import { describe, expect, it, vi } from "vitest";
import { handlerWith, supersededBy } from "./queue";

const REV_A = "a".repeat(64);
const REV_B = "b".repeat(64);

describe("supersededBy", () => {
  it("is false when no current revision is known", () => {
    expect(supersededBy(null, REV_A)).toBe(false);
  });

  it("is false for the current revision", () => {
    expect(supersededBy(REV_A, REV_A)).toBe(false);
  });

  it("is true for an older revision", () => {
    expect(supersededBy(REV_B, REV_A)).toBe(true);
  });
});

describe("handler", () => {
  it("skips a superseded job without taking the lock", async () => {
    const redis = {
      get: vi.fn(async () => REV_B),
      set: vi.fn(),
      del: vi.fn(),
    };
    // The handler imports runCompile directly; the supersede path must return
    // before reaching it, so a rejected promise would surface as a failure.
    const result = await handlerWith(
      {
        data: {
          projectId: crypto.randomUUID(),
          revisionHash: REV_A,
          mainFile: "main.tex",
        },
      },
      redis,
    );
    expect(result).toEqual({ skipped: "superseded" });
    expect(redis.set).not.toHaveBeenCalled();
  });
});