import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLog } from "./parse-log";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const log = (name: string): string =>
  readFileSync(join(fixtures, `${name}.log`), "utf8");

describe("parseLog", () => {
  it("parses a LaTeX error from a ! line and finds its l.<n> line", () => {
    const ds = parseLog(log("missing-package"));
    const e = ds.find((d) =>
      d.message.includes("nonexistentpackage.sty"),
    );
    expect(e?.severity).toBe("error");
    expect(e?.line).toBe(2); // l.3, 0-based
  });

  it("parses an Emergency stop as an error", () => {
    const ds = parseLog(log("missing-package"));
    const e = ds.find((d) => d.message.includes("Emergency stop"));
    expect(e?.severity).toBe("error");
    expect(e?.line).toBe(2);
  });

  it("parses an undefined control sequence from the file:line prefix", () => {
    const ds = parseLog(log("one-error"));
    const e = ds.find((d) =>
      d.message.includes("Undefined control sequence"),
    );
    expect(e?.severity).toBe("error");
    expect(e?.file).toBe("main.tex");
    expect(e?.line).toBe(2);
  });

  it("parses a file:line package error (synthetic: the fixture set has no missing image)", () => {
    const ds = parseLog(
      "./main.tex:4: Package pdftex.def Error: File `missing.png' not found: using draft setting.\n",
    );
    const e = ds[0];
    expect(e?.severity).toBe("error");
    expect(e?.file).toBe("main.tex");
    expect(e?.line).toBe(3);
    expect(e?.message).toContain("Package pdftex.def Error");
  });

  it("turns an overfull hbox into a warning at the paragraph's first line", () => {
    const ds = parseLog(log("overfull-hbox"));
    const w = ds.find((d) => d.message.startsWith("Overfull \\hbox"));
    expect(w?.severity).toBe("warning");
    expect(w?.line).toBe(2);
    expect(w?.message).toMatch(
      /^Overfull \\hbox \([0-9.]+pt too wide\) detected at line 3$/,
    );
  });

  it("turns an underfull vbox into a warning", () => {
    const ds = parseLog(log("underfull-vbox"));
    const w = ds.find((d) => d.message.startsWith("Underfull"));
    expect(w?.severity).toBe("warning");
    expect(w?.line).toBe(2);
  });

  it("turns a LaTeX warning into a warning with its input line", () => {
    const ds = parseLog(log("latex-warning"));
    const w = ds.find((d) => d.message.includes("Reference `missing'"));
    expect(w?.severity).toBe("warning");
    expect(w?.line).toBe(2);
  });

  it("unwraps a 79-column package warning and reads its input line", () => {
    const ds = parseLog(log("package-warning"));
    const w = ds.find((d) => d.message.includes("Package pgfplots Warning"));
    expect(w?.severity).toBe("warning");
    // The wrapped continuation is joined, so the message reaches "tick labels".
    expect(w?.message).toContain("tick labels; missing features");
    expect(w?.line).toBe(2);
  });

  it("turns a missing character into info", () => {
    const ds = parseLog(log("xelatex-unicode"));
    const infos = ds.filter((d) => d.message.startsWith("Missing character"));
    expect(infos.length).toBeGreaterThan(0);
    expect(infos.every((d) => d.severity === "info")).toBe(true);
  });

  it("suppresses duplicate diagnostics by (severity, message, file, line)", () => {
    const line = "LaTeX Warning: Reference `x' on page 1 undefined on input line 2.\n";
    const ds = parseLog(line + line);
    expect(ds).toHaveLength(1);
  });

  it("keeps the original block as raw", () => {
    const ds = parseLog(log("one-error"));
    const e = ds.find((d) =>
      d.message.includes("Undefined control sequence"),
    );
    expect(e?.raw).toContain("./main.tex:3:");
  });

  it("returns an empty array for an empty log", () => {
    expect(parseLog("")).toEqual([]);
  });
});