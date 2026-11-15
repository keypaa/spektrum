// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePrismArchive } from "./prism";
import { readZip, writeZip } from "./zip";

const enc = (s: string) => new TextEncoder().encode(s);
const fixture = () => readZip(new Uint8Array(readFileSync(resolve(import.meta.dirname, "../../../../../e2e/fixtures/prism-projects-2026-11-05.zip"))));

describe("parsePrismArchive", () => {
  it("parses the real archive: 15 projects, drops preview and macOS junk", () => {
    const parsed = parsePrismArchive(fixture());
    expect(parsed.projects.length).toBe(15);
    expect(parsed.projects.every((p) => p.files.every((f) => !f.path.startsWith("preview/")))).toBe(true);
  });

  it("re-roots uploads/ and rewrites includegraphics (with optional args)", () => {
    const zip = writeZip([
      { path: "P/main.tex", data: enc("\\includegraphics[width=2cm]{uploads/x.png}") },
      { path: "P/uploads/x.png", data: new Uint8Array([1]) },
    ]);
    const p = parsePrismArchive(readZip(zip)).projects[0]!;
    expect(p.files.map((f) => f.path)).toContain("x.png");
    expect(p.rewrites).toEqual([{ from: "includegraphics[width=2cm]{uploads/x.png}", to: "includegraphics[width=2cm]{x.png}" }]);
  });

  it("validates the full path before grouping (traversal is rejected, not ignored)", () => {
    const parsed = parsePrismArchive(readZip(writeZip([{ path: "../evil.tex", data: enc("x") }])));
    expect(parsed.rejectedPaths).toContain("../evil.tex");
    expect(parsed.projects).toHaveLength(0);
  });

  it("rejects absolute, backslash, control-character and over-long paths", () => {
    const long = `${"x".repeat(210)}.tex`;
    const parsed = parsePrismArchive(
      readZip(
        writeZip([
          { path: "/etc/passwd", data: enc("x") },
          { path: "P\\evil.tex", data: enc("x") },
          { path: "P/evil\u0001.tex", data: enc("x") },
          { path: `P/${long}`, data: enc("x") },
          { path: "P/./sneaky.tex", data: enc("x") },
        ]),
      ),
    );
    expect(parsed.rejectedPaths).toContain("/etc/passwd");
    expect(parsed.rejectedPaths).toContain("P\\evil.tex");
    expect(parsed.rejectedPaths).toContain("P/evil\u0001.tex");
    expect(parsed.rejectedPaths).toContain(`P/${long}`);
    expect(parsed.rejectedPaths).toContain("P/./sneaky.tex");
    // Nothing of the rejected entries reached a project.
    expect(parsed.projects).toHaveLength(0);
  });

  it("normalises duplicate separators with the shared path rules", () => {
    const parsed = parsePrismArchive(
      readZip(
        writeZip([
          { path: "P//main.tex", data: enc("x") },
          { path: "P/sub//note.tex", data: enc("y") },
        ]),
      ),
    );
    expect(parsed.projects[0]!.files.map((f) => f.path)).toEqual([
      "main.tex",
      "sub/note.tex",
    ]);
  });

  it("drops directory entries and macOS junk", () => {
    const parsed = parsePrismArchive(readZip(writeZip([
      { path: "P/main.tex", data: enc("x") },
      { path: "P/", data: new Uint8Array(0) },
      { path: "__MACOSX/._main.tex", data: enc("x") },
    ])));
    const p = parsed.projects[0]!;
    expect(p.files.map((f) => f.path)).toEqual(["main.tex"]);
  });

  it("drops a root spektrum-export.json instead of importing it", () => {
    const parsed = parsePrismArchive(readZip(writeZip([
      { path: "P/main.tex", data: enc("x") },
      { path: "P/spektrum-export.json", data: enc("{}") },
    ])));
    expect(parsed.projects[0]!.files.some((f) => f.path.endsWith("spektrum-export.json"))).toBe(false);
  });

  it("maps conversation role from content type, not item.role", () => {
    const zip = writeZip([
      { path: "P/main.tex", data: enc("x") },
      { path: "P/conversations/cdx1_a.json", data: enc(JSON.stringify({ conversation_id: "cdx1_a", items: [
        { type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] },
        { type: "message", role: "assistant", content: [{ type: "output_text", text: "hello" }] },
        { type: "function_call", name: "edit_file", arguments: "{}" },
      ] })) },
    ]);
    const p = parsePrismArchive(readZip(zip)).projects[0]!;
    expect(p.conversations[0]!.turns.map((t) => t.role)).toEqual(["user", "assistant", "tool"]);
  });
});