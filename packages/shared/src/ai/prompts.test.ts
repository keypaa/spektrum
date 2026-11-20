import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT, paperReviewStatusMessage } from "./prompts";

describe("SYSTEM_PROMPT", () => {
  it("forbids claiming tool results without an actual tool call", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("never quote tool output");
    expect(SYSTEM_PROMPT).toContain("compile() tool");
  });
});

describe("paperReviewStatusMessage", () => {
  it("uses a zero-padded local timestamp and the extra-high output path", () => {
    const date = new Date(2026, 10, 19, 20, 30, 12);
    expect(paperReviewStatusMessage(date)).toBe(
      "Performing paper review at extra-high reasoning, and outputting work to paper-review-2026-11-19-203012.tex.",
    );
  });
});
