import { applyHunks } from "@spektrum/shared/ai/diff";
import { sha256Hex } from "@spektrum/shared/hash";
import { describe, expect, it } from "vitest";
import {
  DiffError,
  proposeCreate,
  proposeDelete,
  proposeEdit,
  proposeWrite,
} from "./diff";

describe("proposeEdit", () => {
  it("creates one hunk and round-trips", async () => {
    const original = "a\nb\nc\n";
    const proposal = await proposeEdit({
      path: "main.tex",
      original,
      oldText: "b",
      newText: "B",
      reason: "fix",
    });
    expect(proposal.hunks).toHaveLength(1);
    expect(proposal.originalHash).toBe(await sha256Hex(original));
    expect(proposal.proposedContent).toBe("a\nB\nc\n");
    expect(applyHunks(original, proposal.hunks)).toBe(proposal.proposedContent);
  });

  it("throws when oldText occurs zero or two times", async () => {
    await expect(
      proposeEdit({
        path: "main.tex",
        original: "a\nb\nc\n",
        oldText: "z",
        newText: "Z",
        reason: "x",
      }),
    ).rejects.toThrow(/occurs 0 times/);
    await expect(
      proposeEdit({
        path: "main.tex",
        original: "a\na\n",
        oldText: "a",
        newText: "A",
        reason: "x",
      }),
    ).rejects.toThrow(/occurs 2 times/);
  });

  it("rejects a blob document", async () => {
    await expect(
      proposeEdit({
        path: "image.png",
        original: "",
        oldText: "a",
        newText: "b",
        reason: "x",
        kind: "img",
      }),
    ).rejects.toThrow("binary document");
  });
});

describe("proposeWrite", () => {
  it("replaces the whole file and round-trips", async () => {
    const proposal = await proposeWrite({
      path: "main.tex",
      original: "a\n",
      content: "b\n",
      reason: "write",
    });
    expect(proposal.proposedContent).toBe("b\n");
    expect(applyHunks("a\n", proposal.hunks)).toBe("b\n");
  });

  it("rejects a blob document", async () => {
    await expect(
      proposeWrite({
        path: "image.png",
        original: "",
        content: "x",
        reason: "x",
        blobKey: "blob/image.png",
      }),
    ).rejects.toThrow("binary document");
  });
});

describe("proposeCreate", () => {
  it("creates a whole-file hunk from empty", async () => {
    const proposal = await proposeCreate({
      path: "notes.tex",
      content: "hello\n",
      reason: "new",
    });
    expect(proposal.hunks).toHaveLength(1);
    expect(proposal.proposedContent).toBe("hello\n");
    expect(applyHunks("", proposal.hunks)).toBe("hello\n");
  });
});

describe("proposeDelete", () => {
  it("removes every line", async () => {
    const proposal = await proposeDelete({
      path: "main.tex",
      original: "a\nb\n",
      reason: "remove",
    });
    expect(proposal.proposedContent).toBe("");
    expect(applyHunks("a\nb\n", proposal.hunks)).toBe("");
  });
});

describe("DiffError", () => {
  it("is an Error subclass", () => {
    expect(new DiffError("x")).toBeInstanceOf(Error);
  });
});