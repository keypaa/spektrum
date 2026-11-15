// GET /api/health — liveness/readiness probe (spec §19.4).
// Public (proxy.ts allowlists it) and free of internals: it names which
// dependency is down and nothing else.
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@spektrum/db";
import { getRedis } from "@spektrum/shared/rate-limit";

type Up = "up" | "down";

async function pingDb(): Promise<Up> {
  try {
    await db.execute(sql`select 1`);
    return "up";
  } catch {
    return "down";
  }
}

async function pingRedis(): Promise<Up> {
  try {
    await getRedis().ping();
    return "up";
  } catch {
    return "down";
  }
}

export async function GET() {
  const [database, redis] = await Promise.all([pingDb(), pingRedis()]);
  const ok = database === "up" && redis === "up";
  return NextResponse.json(
    { ok, db: database, redis },
    { status: ok ? 200 : 503 },
  );
}