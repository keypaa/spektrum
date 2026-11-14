import { structuredPatch } from "diff";
import { z } from "zod";

/** One jsdiff hunk. `oldStart` is 1-based; `lines` are the diff lines. */
export type DiffHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
};

export type DiffProposal = {
  path: string;
  kind: "replace" | "create" | "delete";
  hunks: DiffHunk[];
  originalHash: string;
  proposedContent: string;
  reason: string;
};

export const diffHunkSchema = z.object({
  oldStart: z.number().int(),
  oldLines: z.number().int(),
  newStart: z.number().int(),
  newLines: z.number().int(),
  lines: z.array(z.string()),
});

export const diffProposalSchema = z.object({
  path: z.string(),
  kind: z.enum(["replace", "create", "delete"]),
  hunks: z.array(diffHunkSchema),
  originalHash: z.string(),
  proposedContent: z.string(),
  reason: z.string(),
});

const NO_NEWLINE = "\\ No newline at end of file";

/**
 * Apply jsdiff hunks to `original`. Hunks are applied bottom-up so earlier
 * offsets stay valid. A hunk whose context/removed lines no longer match
 * throws — the caller must re-run the proposal.
 */
export function applyHunks(original: string, hunks: DiffHunk[]): string {
  const hadTrailingNewline = original.endsWith("\n");
  const lines = original.split("\n");
  if (hadTrailingNewline) lines.pop();

  const ordered = [...hunks].sort((a, b) => b.oldStart - a.oldStart);
  for (const hunk of ordered) {
    const start = hunk.oldStart - 1;
    const expectedOld = hunk.lines
      .filter((line) => line.startsWith(" ") || line.startsWith("-"))
      .map((line) => line.slice(1));

    if (hunk.oldLines !== 0) {
      const actual = lines.slice(start, start + hunk.oldLines);
      if (
        actual.length !== expectedOld.length ||
        actual.some((line, i) => line !== expectedOld[i])
      ) {
        throw new Error(
          `applyHunks: hunk at line ${hunk.oldStart} does not match the original`,
        );
      }
    }

    const replacement = hunk.lines
      .filter(
        (line) =>
          (line.startsWith(" ") || line.startsWith("+")) && line !== NO_NEWLINE,
      )
      .map((line) => line.slice(1));

    lines.splice(start, hunk.oldLines, ...replacement);
  }

  return lines.join("\n") + (hadTrailingNewline ? "\n" : "");
}

export { structuredPatch };