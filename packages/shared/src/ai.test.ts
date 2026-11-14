import { describe, expect, it } from "vitest";
import {
  chatEventSchema,
  FIX_PROMPT,
  REVIEW_PROMPT,
  SYSTEM_PROMPT,
  THINKING,
  TITLE_PROMPT,
} from "./ai";

const diffData = {
  path: "main.tex",
  kind: "replace" as const,
  hunks: [],
  originalHash: "h",
  proposedContent: "x",
  reason: "r",
  id: "d1",
  messageId: "m1",
};

describe("chatEventSchema", () => {
  it("accepts meta, text, diff and done frames", () => {
    expect(
      chatEventSchema.safeParse({
        event: "meta",
        data: { threadId: "t", userMessageId: "u", model: "m" },
      }).success,
    ).toBe(true);
    expect(
      chatEventSchema.safeParse({ event: "text", data: { delta: "hi" } })
        .success,
    ).toBe(true);
    expect(
      chatEventSchema.safeParse({ event: "diff", data: diffData }).success,
    ).toBe(true);
    expect(
      chatEventSchema.safeParse({
        event: "done",
        data: { usage: { in: 1, out: 2 } },
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown event and a missing field", () => {
    expect(
      chatEventSchema.safeParse({ event: "bogus", data: {} }).success,
    ).toBe(false);
    expect(
      chatEventSchema.safeParse({
        event: "meta",
        data: { threadId: "t", userMessageId: "u" },
      }).success,
    ).toBe(false);
  });
});

describe("THINKING", () => {
  it("maps all five levels to an effort and an output cap", () => {
    expect(THINKING.Minimal).toEqual({ effort: "minimal", maxOutput: 4000 });
    expect(THINKING.Low).toEqual({ effort: "low", maxOutput: 8000 });
    expect(THINKING.Medium).toEqual({ effort: "medium", maxOutput: 16000 });
    expect(THINKING.High).toEqual({ effort: "high", maxOutput: 32000 });
    expect(THINKING["Extra high"]).toEqual({ effort: "high", maxOutput: 64000 });
  });
});

describe("prompts", () => {
  it("uses the verbatim system prompt with rules 1-8", () => {
    expect(SYSTEM_PROMPT.startsWith("You are Spektrum's assistant")).toBe(true);
    for (let i = 1; i <= 8; i += 1) {
      expect(SYSTEM_PROMPT).toContain(`${i}.`);
    }
  });

  it("includes the diagnostics and the root-cause instruction in the fix prompt", () => {
    const prompt = FIX_PROMPT([
      {
        severity: "error",
        message: "Undefined control sequence",
        file: "main.tex",
        line: 0,
        raw: "x",
      },
    ]);
    expect(prompt).toContain("Undefined control sequence");
    expect(prompt).toContain("root cause (not the first symptom)");
  });

  it("uses the verbatim review prompt", () => {
    expect(REVIEW_PROMPT).toContain("demanding but fair referee");
  });

  it("uses the verbatim title prompt", () => {
    const prompt = TITLE_PROMPT("Fix the intro", "Done");
    expect(prompt).toContain('Reply with JSON only: {"title": "..."}');
    expect(prompt).toContain("at most 60 characters");
    expect(prompt).toContain("Fix the intro");
  });
});