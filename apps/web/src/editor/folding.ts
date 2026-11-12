// Folding providers (spec §7.3): region, section, environment.
//
// The pure functions operate on 1-based line numbers and emit a range only
// when `end > start`; the Monaco providers are thin wrappers mapping `kind`
// to FoldingRangeKind. Unclosed constructs emit nothing (never crash).

import type * as monaco from "monaco-editor";

export interface FoldRange {
  start: number;
  end: number;
  kind: "region" | "section" | "environment";
}

const REGION_OPEN = /^\s*%\s*\{\s*$/;
const REGION_CLOSE = /^\s*%\s*\}\s*$/;
const SECTION_RE =
  /^\s*\\(documentclass|part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\b/;
const ENV_BEGIN_RE = /^\s*\\begin\{([\w*@]+)\}/;
const ENV_END_RE = /^\s*\\end\{([\w*@]+)\}/;
const GROUP_BEGIN_RE = /^\s*\\begingroup\b/;
const GROUP_END_RE = /^\s*\\endgroup\b/;
const REGION_MARK_RE = /^\s*%\s*Region\b/;
const REGION_MARK_END_RE = /^\s*%\s*Endregion\b/;

export function regionFolds(lines: string[]): FoldRange[] {
  const ranges: FoldRange[] = [];
  const stack: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (REGION_OPEN.test(line)) {
      stack.push(i + 1);
    } else if (REGION_CLOSE.test(line)) {
      const start = stack.pop();
      if (start !== undefined && start < i + 1) {
        ranges.push({ start, end: i + 1, kind: "region" });
      }
    }
  }
  // Outer regions close last; present them outermost-first.
  return ranges.sort((a, b) => a.start - b.start || b.end - a.end);
}

const LEVELS: Record<string, number> = {
  documentclass: 0,
  part: 0,
  chapter: 1,
  section: 1,
  subsection: 2,
  subsubsection: 3,
  paragraph: 4,
  subparagraph: 5,
};

export function sectionFolds(lines: string[]): FoldRange[] {
  const ranges: FoldRange[] = [];
  // Open (start line, level) pairs; a new heading of the same or higher
  // level closes them first. A fold ends on the line before the next heading.
  const stack: Array<{ start: number; level: number; isDocument: boolean }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = line.match(SECTION_RE);
    if (m) {
      const level = LEVELS[m[1]!] ?? 1;
      while (stack.length && stack[stack.length - 1]!.level >= level) {
        const top = stack.pop()!;
        if (top.start < i) {
          ranges.push({ start: top.start, end: i, kind: "section" });
        }
      }
      stack.push({
        start: i + 1,
        level,
        isDocument: m[1] === "documentclass",
      });
    } else if (
      /^\\end\{document\}\s*$/.test(line) &&
      stack.length &&
      stack[stack.length - 1]!.isDocument
    ) {
      const top = stack.pop()!;
      if (top.start <= i) {
        ranges.push({ start: top.start, end: i + 1, kind: "section" });
      }
    }
  }
  return ranges;
}

export function environmentFolds(lines: string[]): FoldRange[] {
  const ranges: FoldRange[] = [];
  const stack: Array<{ start: number; close: RegExp; endRe: RegExp }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (stack.length) {
      const top = stack[stack.length - 1]!;
      if (top.endRe.test(line)) {
        stack.pop();
        if (top.start < i) {
          ranges.push({ start: top.start, end: i + 1, kind: "environment" });
        }
        continue;
      }
    }
    const begin = line.match(ENV_BEGIN_RE);
    if (begin) {
      const env = begin[1]!;
      stack.push({
        start: i + 1,
        close: ENV_END_RE,
        endRe: new RegExp(`^\\s*\\\\end\\{${env.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}`),
      });
    } else if (GROUP_BEGIN_RE.test(line)) {
      stack.push({ start: i + 1, close: GROUP_END_RE, endRe: GROUP_END_RE });
    } else if (REGION_MARK_RE.test(line)) {
      stack.push({
        start: i + 1,
        close: REGION_MARK_END_RE,
        endRe: REGION_MARK_END_RE,
      });
    }
  }
  return ranges;
}

function toFoldingRanges(
  ranges: FoldRange[],
  languages: typeof monaco.languages,
): monaco.languages.FoldingRange[] {
  const kind = (k: FoldRange["kind"]) =>
    k === "region"
      ? languages.FoldingRangeKind.Region
      : k === "section"
        ? new languages.FoldingRangeKind("section")
        : new languages.FoldingRangeKind("environment");
  return ranges.map((r) => ({
    start: r.start,
    end: r.end,
    kind: kind(r.kind),
  }));
}

let registered = false;

export function registerFolding(m: typeof monaco): void {
  if (registered) return;
  registered = true;

  for (const [compute, name] of [
    [regionFolds, "region"],
    [sectionFolds, "section"],
    [environmentFolds, "environment"],
  ] as const) {
    m.languages.registerFoldingRangeProvider("latex", {
      provideFoldingRanges(model) {
        const ranges = compute(model.getValue().split("\n"));
        // Monaco drops ranges with end <= start and recomputes nesting; the
        // built-in kinds cover region/section, environment is ours.
        const folded = toFoldingRanges(ranges, m.languages);
        return folded.map((r) => ({
          ...r,
          kind: new m.languages.FoldingRangeKind(name),
        }));
      },
    });
  }
}