import { describe, expect, it } from "vitest";
import {
  compileJobSchema,
  diagnosticSchema,
  renderEventSchema,
  projectStatsSchema,
} from "./compile";

describe("compile contracts", () => {
  it("accepts a compile job", () => {
    expect(
      compileJobSchema.parse({
        projectId: crypto.randomUUID(),
        revisionHash: "a".repeat(64),
        mainFile: "main.tex",
      }).mainFile,
    ).toBe("main.tex");
  });

  it("rejects a diagnostic with a negative line", () => {
    expect(
      diagnosticSchema.safeParse({
        severity: "error",
        message: "x",
        line: -1,
        raw: "",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown render event", () => {
    expect(renderEventSchema.safeParse({ event: "bogus" }).success).toBe(false);
  });

  it("accepts project stats", () => {
    expect(
      projectStatsSchema.parse({
        words: 1,
        wordsInText: 1,
        wordsInHeaders: 0,
        wordsOutsideText: 0,
        headers: 0,
        figures: 0,
        mathInline: 0,
        mathDisplay: 0,
      }).words,
    ).toBe(1);
  });
});