// TeX log parser (spec §11.3). `main.log` → Diagnostic[].
//
// Line numbers: TeX prints 1-based lines (`l.12`, `file.tex:12:`, `at lines 12--14`);
// the model stores 0-based (`line = n - 1`). The UI adds one back.
//
// LaTeX wraps the log at 79 columns; a line whose length is exactly 79 is joined
// with the next before matching (so `Package pgfplots Warning: …` is one message).

import type { Diagnostic } from "@spektrum/shared";
import { sanitizeDiagnosticPath } from "@spektrum/shared/paths";

const WRAP = 79;

/** Join lines that TeX wrapped at exactly 79 columns. */
function unwrap(raw: string): string[] {
  const lines = raw.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i] ?? "";
    // TeX wraps at 79 columns; a wrapped line is followed by its continuation,
    // which can itself be 79 chars. Track the *raw* length, not the joined one.
    let lastRawLength = (lines[i] ?? "").length;
    while (lastRawLength === WRAP && i + 1 < lines.length) {
      const next = lines[i + 1] ?? "";
      line += next;
      lastRawLength = next.length;
      i += 1;
    }
    out.push(line);
  }
  return out;
}

/** The first `on input line N` within the next few lines (warnings wrap). */
function inputLine(lines: string[], from: number): RegExpExecArray | null {
  for (let i = from; i < Math.min(lines.length, from + 3); i++) {
    const m = /on input line (\d+)/.exec(lines[i] ?? "");
    if (m) return m;
  }
  return null;
}

/** The first `l.<n>` within the next few lines (TeX prints it after the error). */
function nextLinenum(lines: string[], from: number): number | undefined {
  for (let i = from; i < Math.min(lines.length, from + 12); i++) {
    const m = /^l\.(\d+)/.exec(lines[i] ?? "");
    if (m) return Math.max(0, Number(m[1]) - 1);
  }
  return undefined;
}

const FILE_LINE_RE = /^(?:\.\/)?([^\s:]+):(\d+):\s?(.*)$/;
const TEXT_FILE_RE = /\.(?:tex|sty|cls|bib|aux)$/;

export function parseLog(raw: string): Diagnostic[] {
  const lines = unwrap(raw);
  const out: Diagnostic[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    // `file.tex:12: message` (from -file-line-error).
    const fl = FILE_LINE_RE.exec(line);
    if (fl && TEXT_FILE_RE.test(fl[1] ?? "")) {
      const message = (fl[3] ?? "").trim();
      const severity: Diagnostic["severity"] = /\bWarning\b/.test(message)
        ? "warning"
        : "error";
      out.push({
        severity,
        message,
        file: sanitizeDiagnosticPath(fl[1] ?? ""),
        line: Math.max(0, Number(fl[2]) - 1),
        raw: line,
      });
      continue;
    }

    // `! LaTeX Error: …` / `! Emergency stop.` / `! Undefined control sequence.`
    if (line.startsWith("! ")) {
      const message = line.replace(/^!\s*/, "").trim();
      out.push({
        severity: "error",
        message,
        line: nextLinenum(lines, i + 1),
        raw: line,
      });
      continue;
    }

    // Overfull \hbox (…pt too wide) in paragraph at lines A--B
    const over = /^Overfull \\hbox \(([^)]*)\) (?:in paragraph at lines|detected at line) (\d+)/.exec(
      line,
    );
    if (over) {
      const first = Number(over[2]);
      out.push({
        severity: "warning",
        message: `Overfull \\hbox (${over[1]}) detected at line ${first}`,
        line: Math.max(0, first - 1),
        raw: line,
      });
      continue;
    }

    // Underfull \hbox / \vbox (…badness…) [in paragraph at lines|detected at line] N
    const under = /^Underfull \\[hv]box \(([^)]*)\) (?:in paragraph at lines|detected at line) (\d+)/.exec(
      line,
    );
    if (under) {
      out.push({
        severity: "warning",
        message: line.trim(),
        line: Math.max(0, Number(under[2]) - 1),
        raw: line,
      });
      continue;
    }

    // LaTeX Warning: … on input line N.
    if (line.startsWith("LaTeX Warning:")) {
      const m = /on input line (\d+)/.exec(line) ?? inputLine(lines, i);
      out.push({
        severity: "warning",
        message: line.replace(/^LaTeX Warning:\s*/, "").trim(),
        line: m ? Math.max(0, Number(m[1]) - 1) : undefined,
        raw: line,
      });
      continue;
    }

    // Package xyz Warning: …
    if (/^Package .+ Warning:/.test(line)) {
      const m = /on input line (\d+)/.exec(line) ?? inputLine(lines, i);
      out.push({
        severity: "warning",
        message: line.trim(),
        line: m ? Math.max(0, Number(m[1]) - 1) : undefined,
        raw: line,
      });
      continue;
    }

    // Missing character: There is no … (info)
    if (line.startsWith("Missing character:")) {
      const m = /on input line (\d+)/.exec(line);
      out.push({
        severity: "info",
        message: line.trim(),
        line: m ? Math.max(0, Number(m[1]) - 1) : undefined,
        raw: line,
      });
      continue;
    }
  }

  // Duplicate suppression by (severity, message, file, line).
  const seen = new Set<string>();
  return out.filter((d) => {
    const key = `${d.severity}|${d.message}|${d.file ?? ""}|${d.line ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}