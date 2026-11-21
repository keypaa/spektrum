import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import {
  documents,
  pdfRenders,
  projects,
  users,
} from "@spektrum/db/schema";
import type { Diagnostic } from "@spektrum/shared/compile";
import { buildContext, estimateTokens } from "./context";
import { extractPdfText } from "./pdf-text";

vi.mock("./pdf-text", () => ({
  extractPdfText: vi.fn(async () => ({
    text: "--- page 1 ---\nbrief text",
    pages: 1,
    truncated: false,
  })),
}));

const run = Math.random().toString(36).slice(2, 10);
const userId = `ctx-${run}`;
const otherId = `ctx-other-${run}`;
const projectId = crypto.randomUUID();
const HASH = "a".repeat(64);

const diagnostics: Diagnostic[] = Array.from({ length: 11 }, (_, i) => ({
  severity: "error" as const,
  message: `diag-${i}`,
  file: "main.tex",
  line: i,
  raw: `raw-${i}`,
}));

beforeAll(async () => {
  await db.insert(users).values([
    { id: userId, email: `ctx-${run}@test.local`, name: "C" },
    { id: otherId, email: `ctx-other-${run}@test.local`, name: "O" },
  ]);
  await db.insert(projects).values({ id: projectId, ownerId: userId, name: "Ctx" });
  await db.insert(documents).values([
    {
      projectId,
      path: "main.tex",
      kind: "tex",
      content: "main line\n\\section{Intro}\n",
    },
    {
      projectId,
      path: "refs.bib",
      kind: "bib",
      content: "@article{key1,\n  title={A title}\n}\n@book{key2,\n  title={B}\n}\n",
    },
    { projectId, path: "a.tex", kind: "tex", content: "alpha\nbeta\n" },
    {
      projectId,
      path: "multi.tex",
      kind: "tex",
      content: "one\ntwo\nthree\nfour\n",
    },
    {
      projectId,
      path: "brief.pdf",
      kind: "img",
      blobKey: "blob/brief.pdf",
      content: null,
    },
    { projectId, path: "b.tex", kind: "tex", content: "b content\n" },
    { projectId, path: "big.tex", kind: "tex", content: "x".repeat(2000) },
    {
      projectId,
      path: "image.png",
      kind: "img",
      blobKey: "blob/image.png",
      content: null,
    },
  ]);
  await db.insert(pdfRenders).values({
    projectId,
    revisionHash: HASH,
    mainFile: "main.tex",
    status: "error",
    diagnostics,
    log: "log",
  });
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, otherId));
  await pool.end();
});

describe("estimateTokens", () => {
  it("uses four characters per token, rounded up", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("buildContext", () => {
  it("numbers the selected lines", async () => {
    const result = await buildContext({
      userId,
      projectId,
      mainFile: "main.tex",
      selection: { path: "multi.tex", startLine: 2, endLine: 3 },
      history: [],
    });
    expect(result.text).toContain('lines="2-3"');
    expect(result.text).toContain("2| two");
    expect(result.text).toContain("3| three");
  });

  it("injects a pinned PDF with page markers and reports its pages", async () => {
    const result = await buildContext({
      userId,
      projectId,
      mainFile: "main.tex",
      pinnedPaths: ["brief.pdf"],
      history: [],
    });
    expect(result.text).toContain('<pdf path="brief.pdf" pages="1">');
    expect(result.text).toContain("--- page 1 ---");
    expect(result.text).toContain("brief text");
    expect(result.text).toContain("brief.pdf (pdf, 1 pages)");
    expect(extractPdfText).toHaveBeenCalledWith(
      userId,
      projectId,
      "brief.pdf",
    );
  });

  it("degrades gracefully when PDF extraction fails", async () => {
    vi.mocked(extractPdfText).mockRejectedValueOnce(new Error("bad pdf"));
    const result = await buildContext({
      userId,
      projectId,
      mainFile: "main.tex",
      pinnedPaths: ["brief.pdf"],
      history: [],
    });
    expect(result.text).toContain('<pdf path="brief.pdf"');
    expect(result.text).toContain("could not extract text");
  });

  it("drops PDF sections before truncating the main file", async () => {
    const result = await buildContext({
      userId,
      projectId,
      mainFile: "main.tex",
      pinnedPaths: ["brief.pdf"],
      history: [{ role: "user", text: "hello" }],
      limit: 50,
    });
    expect(result.dropped).toContain("pdfs");
  });

  it("orders the sections and extracts only bib keys", async () => {
    const result = await buildContext({
      userId,
      projectId,
      mainFile: "main.tex",
      touchedPaths: ["a.tex"],
      pinnedPaths: ["b.tex"],
      selection: { path: "a.tex", startLine: 1, endLine: 1 },
      history: [
        { role: "user", text: "hello" },
        { role: "assistant", text: "hi" },
      ],
    });

    const text = result.text;
    expect(text.indexOf("<manifest>")).toBeLessThan(text.indexOf("<main"));
    expect(text.indexOf("<main")).toBeLessThan(text.indexOf("<files"));
    expect(text.indexOf("<files")).toBeLessThan(text.indexOf("<bib_keys"));
    expect(text.indexOf("<bib_keys")).toBeLessThan(text.indexOf("<selection"));
    expect(text.indexOf("<selection")).toBeLessThan(text.indexOf("<diagnostics"));
    expect(text.indexOf("<diagnostics")).toBeLessThan(text.indexOf("<history"));

    expect(text).toContain("key1");
    expect(text).toContain("key2");
    expect(text).not.toContain("title={");
    expect(text).toContain('<files path="b.tex">');
    expect(text).toContain('<selection path="a.tex" lines="1-1">');
    expect(text).toContain("alpha");
    expect(text).toContain("User: hello");
    expect(text).toContain("Assistant: hi");
    expect(text).toContain("main.tex (tex,");
    expect(text).toContain("image.png (img, null)");
  });

  it("keeps only the last ten diagnostics", async () => {
    const result = await buildContext({
      userId,
      projectId,
      mainFile: "main.tex",
      history: [],
    });
    expect(result.text).not.toContain("diag-0");
    expect(result.text).toContain("diag-10");
  });

  it("drops history, then bib, then touched when over the limit", async () => {
    const result = await buildContext({
      userId,
      projectId,
      mainFile: "main.tex",
      touchedPaths: ["a.tex"],
      pinnedPaths: ["b.tex"],
      selection: { path: "a.tex", startLine: 1, endLine: 1 },
      history: [{ role: "user", text: "hello" }],
      limit: 120,
    });
    expect(result.dropped).toEqual(["history", "bib", "touched"]);
    expect(result.text).toContain("<main");
    expect(result.text).toContain('<selection path="a.tex"');
  });

  it("truncates a main document that alone exceeds the limit", async () => {
    const result = await buildContext({
      userId,
      projectId,
      mainFile: "big.tex",
      history: [],
      limit: 150,
    });
    expect(result.tokens).toBeLessThanOrEqual(150);
    expect(result.text).toContain("… [truncated]");
  });

  it("returns nothing for another owner", async () => {
    const result = await buildContext({
      userId: otherId,
      projectId,
      mainFile: "main.tex",
      history: [],
    });
    expect(result.text).not.toContain("main line");
    expect(result.text).not.toContain("key1");
  });
});