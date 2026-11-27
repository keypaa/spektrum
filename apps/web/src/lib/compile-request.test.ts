import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  document: vi.fn(),
  documents: vi.fn(),
  consume: vi.fn(),
  redisSet: vi.fn(),
  enqueueCompile: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@spektrum/db", () => ({ db: { select: mocks.select } }));
vi.mock("@spektrum/shared/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@spektrum/shared/rate-limit")
  >();
  return {
    ...actual,
    consume: mocks.consume,
    getRedis: () => ({ set: mocks.redisSet }),
  };
});
vi.mock("./compile-queue", () => ({ enqueueCompile: mocks.enqueueCompile }));
vi.mock("./documents", () => ({
  getDocumentByPath: mocks.document,
  listRevisionDocuments: mocks.documents,
}));
vi.mock("./projects", () => ({ getProject: mocks.project }));

import { enqueueProjectCompile } from "./compile-request";

const emptyChain = {
  from: () => emptyChain,
  where: () => Promise.resolve([]),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.project.mockResolvedValue({ id: "project" });
  mocks.document.mockResolvedValue({ path: "main.tex" });
  mocks.documents.mockResolvedValue([]);
  mocks.consume.mockResolvedValue({ allowed: true });
  mocks.redisSet.mockResolvedValue("OK");
  mocks.enqueueCompile.mockResolvedValue(undefined);
  mocks.select.mockReturnValue(emptyChain);
});

describe("enqueueProjectCompile", () => {
  it("does not enqueue a BullMQ job for browser-side compilation", async () => {
    const result = await enqueueProjectCompile(
      { id: "user" },
      "11111111-1111-4111-8111-111111111111",
      "main.tex",
    );

    expect(result.kind).toBe("enqueued");
    if (result.kind !== "enqueued") throw new Error("expected enqueued");
    expect(mocks.enqueueCompile).not.toHaveBeenCalled();
    expect(mocks.redisSet).toHaveBeenCalledWith(
      expect.stringContaining("11111111-1111-4111-8111-111111111111"),
      result.revision,
    );
  });

  it("keeps the cached-revision short circuit", async () => {
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => Promise.resolve([{ id: "render" }]),
      }),
    });

    const result = await enqueueProjectCompile(
      { id: "user" },
      "11111111-1111-4111-8111-111111111111",
      "main.tex",
    );

    expect(result.kind).toBe("cached");
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.enqueueCompile).not.toHaveBeenCalled();
  });

  it("keeps the hourly and per-minute rate limits", async () => {
    mocks.consume.mockResolvedValueOnce({ allowed: false, retryAfterMs: 1234 });

    const result = await enqueueProjectCompile(
      { id: "user" },
      "11111111-1111-4111-8111-111111111111",
      "main.tex",
    );

    expect(result).toEqual({ kind: "rate_limited", retryAfterMs: 1234 });
    expect(mocks.redisSet).not.toHaveBeenCalled();
    expect(mocks.enqueueCompile).not.toHaveBeenCalled();
  });
});
