import { describe, expect, it, vi } from "vitest";
import type { DiffProposal, MessagePart } from "@spektrum/shared/ai";
import {
  acceptDiff,
  MAX_DOCUMENT_CHARS,
  TOO_LARGE_MESSAGE,
  type DiffAcceptContext,
} from "./diff-accept";

type DiffPart = Extract<MessagePart, { type: "diff" }>;

const proposal = (
  overrides: Partial<DiffProposal> = {},
): DiffProposal => ({
  path: "main.tex",
  kind: "replace",
  hunks: [
    { oldStart: 2, oldLines: 1, newStart: 2, newLines: 1, lines: ["-b", "+B"] },
  ],
  originalHash: "h",
  proposedContent: "a\nB\nc\n",
  reason: "fix",
  ...overrides,
});

const part = (overrides: Partial<DiffProposal> = {}): DiffPart => ({
  type: "diff",
  id: "d1",
  messageId: "m1",
  proposal: proposal(overrides),
  status: "pending",
});

function ctx(overrides: Partial<DiffAcceptContext> = {}): DiffAcceptContext {
  return {
    projectId: "p1",
    activePath: "main.tex",
    findDoc: (path) => ({ id: `doc-${path}` }),
    currentContent: () => "a\nb\nc\n",
    baselineFor: () => "2026-01-01",
    openPath: vi.fn(async () => {}),
    whenLoaded: vi.fn(async () => {}),
    applyHunks: vi.fn(),
    save: vi.fn(async () => ({ updatedAt: "2026-02-02" })),
    create: vi.fn(async (path: string) => ({ id: `doc-${path}`, updatedAt: "2026-02-02" })),
    remove: vi.fn(async () => {}),
    onSaved: vi.fn(),
    ...overrides,
  };
}

describe("acceptDiff", () => {
  it("opens a non-active path, then saves the target document id", async () => {
    const c = ctx({ activePath: "main.tex" });
    const result = await acceptDiff(part({ path: "other.tex" }), c);

    expect(result).toEqual({ ok: true });
    expect(c.openPath).toHaveBeenCalledWith("other.tex");
    expect(c.whenLoaded).toHaveBeenCalledWith("other.tex");
    expect(c.applyHunks).toHaveBeenCalledWith("other.tex", expect.any(Array));
    expect(c.save).toHaveBeenCalledWith(
      "doc-other.tex",
      "a\nB\nc\n",
      "2026-01-01",
    );
    expect(c.onSaved).toHaveBeenCalledWith(
      "other.tex",
      "a\nB\nc\n",
      "2026-02-02",
    );
  });

  it("rejects a proposal over the 512 KB cap without saving", async () => {
    const c = ctx();
    const result = await acceptDiff(
      part({ proposedContent: "x".repeat(MAX_DOCUMENT_CHARS + 1) }),
      c,
    );
    expect(result).toEqual({ ok: false, error: TOO_LARGE_MESSAGE });
    expect(c.save).not.toHaveBeenCalled();
  });

  it("creates the document before saving when it does not exist", async () => {
    const c = ctx({
      findDoc: (path) => (path === "main.tex" ? { id: "doc-main.tex" } : undefined),
    });
    const result = await acceptDiff(
      part({ path: "notes.tex", kind: "create", hunks: [], proposedContent: "hello\n" }),
      c,
    );
    expect(result).toEqual({ ok: true });
    expect(c.create).toHaveBeenCalledWith("notes.tex");
    expect(c.save).toHaveBeenCalledWith("doc-notes.tex", "hello\n", "2026-01-01");
  });

  it("deletes the document without saving content", async () => {
    const c = ctx();
    const result = await acceptDiff(part({ kind: "delete" }), c);
    expect(result).toEqual({ ok: true });
    expect(c.remove).toHaveBeenCalledWith("main.tex");
    expect(c.save).not.toHaveBeenCalled();
  });
});