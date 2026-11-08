import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@spektrum/db";
import { getRedis } from "@spektrum/shared/rate-limit";

// GET /api/health — liveness/readiness probe. Public (proxy.ts allowlists it).
// 200 only when Postgres and Redis both answer.
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    await getRedis().ping();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
