import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { users } from "@spektrum/db/schema";
import type { NextRequest } from "next/server";

const ownerId = `prefroute-owner-${crypto.randomUUID()}`;
vi.mock("@/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/auth/session")>()),
  requireUser: async () => ({ id: ownerId, email: "prefs@test.local", role: "member" }),
}));

import { GET, PUT } from "./route";
import { DEFAULT_PREFERENCES } from "@spektrum/shared/preferences";

const ORIGIN = "http://localhost:3000";

function req(method: string, body?: unknown, origin: string | null = ORIGIN): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(`${ORIGIN}/api/user/preferences`, init) as NextRequest;
}

beforeAll(async () => {
  await db.insert(users).values({
    id: ownerId,
    email: "prefs@test.local",
    name: "Prefs Test",
  });
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, ownerId));
  await pool.end();
});

describe("GET /api/user/preferences", () => {
  it("returns the defaults when the user has no row", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect((await res.json()).preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it("returns the stored object after a PUT", async () => {
    await PUT(req("PUT", { ...DEFAULT_PREFERENCES, vimMode: true, editorFontSize: 15 }));

    const res = await GET(req("GET"));
    const body = await res.json();
    expect(body.preferences.vimMode).toBe(true);
    expect(body.preferences.editorFontSize).toBe(15);
  });
});

describe("PUT /api/user/preferences", () => {
  it("upserts and returns the stored object", async () => {
    const res = await PUT(req("PUT", { ...DEFAULT_PREFERENCES, pdfDarkMode: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preferences.pdfDarkMode).toBe(true);

    // A second PUT replaces the first.
    await PUT(req("PUT", { ...DEFAULT_PREFERENCES, pdfDarkMode: false }));
    const second = await GET(req("GET"));
    expect((await second.json()).preferences.pdfDarkMode).toBe(false);
  });

  it("400s on an unknown key", async () => {
    const res = await PUT(
      req("PUT", { ...DEFAULT_PREFERENCES, bogus: "x" }),
    );
    expect(res.status).toBe(400);
  });

  it("400s on an out-of-range font size", async () => {
    const res = await PUT(req("PUT", { ...DEFAULT_PREFERENCES, editorFontSize: 99 }));
    expect(res.status).toBe(400);
  });

  it("403s without a matching origin (CSRF)", async () => {
    const res = await PUT(
      req("PUT", { ...DEFAULT_PREFERENCES }, "https://evil.example"),
    );
    expect(res.status).toBe(403);
  });

  it("403s with no origin header", async () => {
    const res = await PUT(req("PUT", { ...DEFAULT_PREFERENCES }, null));
    expect(res.status).toBe(403);
  });
});