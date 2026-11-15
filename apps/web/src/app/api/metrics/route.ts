// GET /api/metrics — Prometheus exposition (spec §19.4).
//
// Guarded by METRICS_TOKEN. In production an unset token fails closed (503)
// rather than publishing metrics unauthenticated; in development it stays open
// so `curl localhost:3000/api/metrics` works out of the box.
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { loadWebEnv } from "@spektrum/shared/env";
import { registry } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  // Read per request: the token and NODE_ENV can differ between the process
  // start and a later deploy of the same container.
  let token = process.env.METRICS_TOKEN;
  let nodeEnv: string = process.env.NODE_ENV ?? "development";
  try {
    const env = loadWebEnv();
    token = env.metricsToken;
    nodeEnv = env.nodeEnv;
  } catch {
    // A misconfigured process has no validated env; fall back to the raw
    // values above so the endpoint still fails closed in production.
  }

  if (token) {
    const header = req.headers.get("authorization") ?? "";
    const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!tokenMatches(provided, token)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (nodeEnv === "production") {
    return NextResponse.json(
      { error: "metrics_disabled", message: "METRICS_TOKEN is not set" },
      { status: 503 },
    );
  }

  const body = await registry.metrics();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}