// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { appendStreamDelta, partsFromThreadMessages } from "./use-chat";

describe("partsFromThreadMessages", () => {
  it("keeps reloaded user turns on the right", () => {
    const parts = partsFromThreadMessages([
      { role: "user", content: { parts: [{ type: "text", text: "hey" }] } },
      { role: "assistant", content: { parts: [{ type: "text", text: "Hi" }] } },
    ]);
    expect(parts[0]).toEqual({ type: "text", text: "User: hey" });
    expect(parts[1]).toEqual({ type: "text", text: "Hi" });
  });
});

describe("appendStreamDelta", () => {
  it("merges consecutive thinking deltas into one block", () => {
    let parts = appendStreamDelta([], "thinking", "The");
    parts = appendStreamDelta(parts, "thinking", " user is greeting");
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ type: "thinking", text: "The user is greeting" });
  });

  it("starts a new part only when the stream switches type", () => {
    let parts = appendStreamDelta([], "thinking", "reasoning");
    parts = appendStreamDelta(parts, "text", "Hi");
    parts = appendStreamDelta(parts, "thinking", "more reasoning");
    expect(parts.map((part) => part.type)).toEqual(["thinking", "text", "thinking"]);
  });

  it("starts a fresh block after a tool event", () => {
    const parts = appendStreamDelta(
      [
        {
          type: "tool_result",
          id: "t1",
          ok: true,
          summary: "done",
        },
      ],
      "thinking",
      "after tool",
    );
    expect(parts).toHaveLength(2);
    expect(parts[1]).toEqual({ type: "thinking", text: "after tool" });
  });
});
