import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { users } from "@spektrum/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth/auth";
import { hashPassword } from "@/auth/password";

// The route calls requireUser(), which reads next/headers — mock it to return
// the cookie of a real signed-in session created through auth.handler.
let sessionCookie = "";
vi.mock("next/headers", () => ({
  headers: async () => new Headers(sessionCookie ? { cookie: sessionCookie } : {}),
}));

import { GET, PUT, DELETE } from "./route";

const run = Math.random().toString(36).slice(2, 10);
const email = `llmkey-route-${run}@test.local`;
const password = "llm key route test password";
const userId = `llmkey-${run}`;
const ip = `10.55.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const API_KEY = "sk-test-abcdefghijklmnopqrstuvwxyz0123456789";

beforeAll(async () => {
  await db.execute(sql`delete from users where id = ${userId}`);
  await db.execute(sql`
    insert into users (id,email,name,email_verified,role,banned)
    values (${userId}, ${email}, 'K', true, 'member', false)`);
  await db.execute(sql`
    insert into accounts (id,user_id,provider_id,account_id,password)
    values (${`acct-${run}`}, ${userId}, 'credential', ${userId}, ${await hashPassword(password)})`);
  const signIn = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ email, password }),
    }),
  );
  expect(signIn.status).toBe(200);
  sessionCookie = signIn.headers.get("set-cookie")!.split(";")[0]!;
});

afterAll(async () => {
  await db.execute(sql`delete from users where id = ${userId}`);
  await pool.end();
});

function req(method: string, body?: string) {
  return new Request("http://localhost:3000/api/user/llm-key", {
    method,
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    ...(body === undefined ? {} : { body }),
  }) as never;
}

describe("llm-key route", () => {
  it("GET starts unconfigured", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: false });
  });

  it("PUT with a bad key shape returns 400", async () => {
    const res = await PUT(req("PUT", JSON.stringify({ apiKey: "short" })));
    expect(res.status).toBe(400);
  });

  it("PUT stores the key encrypted and never echoes it", async () => {
    const res = await PUT(req("PUT", JSON.stringify({ apiKey: API_KEY })));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain(API_KEY);
    const parsed = JSON.parse(body) as { configured: boolean; last4?: string };
    expect(parsed.configured).toBe(true);
    expect(parsed.last4).toBe(API_KEY.slice(-4));

    const row = await db
      .select({ ct: users.llmApiKeyCiphertext })
      .from(users)
      .where(eq(users.id, userId));
    expect(row[0]!.ct).not.toBeNull();
    expect(row[0]!.ct).not.toContain(API_KEY);
  });

  it("GET reports configured with last4 only", async () => {
    const res = await GET(req("GET"));
    const body = await res.text();
    expect(body).not.toContain(API_KEY);
    expect(JSON.parse(body)).toEqual({ configured: true, last4: API_KEY.slice(-4) });
  });

  it("DELETE removes the key", async () => {
    const res = await DELETE(req("DELETE"));    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: false });
    const row = await db
      .select({ ct: users.llmApiKeyCiphertext, l4: users.llmApiKeyLast4 })
      .from(users)
      .where(eq(users.id, userId));
    expect(row[0]!.ct).toBeNull();
    expect(row[0]!.l4).toBeNull();
  });
});

describe("llm-key route without a session", () => {
  it("returns 401, never a 500", async () => {
    sessionCookie = "";
    const res = await GET(req("GET"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });
});
