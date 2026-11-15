// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { chatMessages, chatThreads, importBatches, projects, users } from "@spektrum/db/schema";
import { writeZip } from "./zip";
import { importArchive } from "./import-archive";

const run = Math.random().toString(36).slice(2, 10);
const userId = `imp-${run}`;
const enc = (s: string) => new TextEncoder().encode(s);
const archive = () => writeZip([
  { path: "P1/main.tex", data: enc("\\documentclass{article}\n\\begin{document}\n\\section{Intro}\n\\end{document}\n") },
  { path: "P1/refs.bib", data: enc("@article{k,title={T}}\n") },
  { path: "P1/conversations/cdx1_a.json", data: enc(JSON.stringify({ conversation_id: "cdx1_a", items: [
    { type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "hello" }] },
  ] })) },
  { path: "P2/main.tex", data: enc("x") },
]);

beforeAll(async () => { await db.insert(users).values({ id: userId, email: `imp-${run}@test.local`, name: "I" }); });
afterAll(async () => { await db.delete(users).where(eq(users.id, userId)); await pool.end(); });

describe("importArchive", () => {
  it("imports projects, files and conversations, then is idempotent", async () => {
    const first = await importArchive(userId, archive());
    expect(first.projects).toBe(2);
    expect(first.files).toBe(3);
    expect(first.conversationsImported).toBe(1);
    expect(await db.select().from(projects).where(eq(projects.ownerId, userId))).toHaveLength(2);
    expect(await db.select().from(chatThreads)).toHaveLength(1);
    expect(await db.select().from(chatMessages)).toHaveLength(2);
    expect(await db.select().from(importBatches).where(eq(importBatches.userId, userId))).toHaveLength(2);

    const second = await importArchive(userId, archive());
    expect(second.skipped.map((s) => s.project)).toEqual(["P1", "P2"]);
    expect(await db.select().from(projects).where(eq(projects.ownerId, userId))).toHaveLength(2);
  });
});