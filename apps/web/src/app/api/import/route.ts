// POST /api/import — Prism archive import (spec §13.2).
//
// The archive is untrusted, so the guards run before the body is read:
// session -> same-origin -> rate limit -> `content-length` -> parse. The body
// is parsed only after the declared length is under the cap, and a parse
// failure (Next truncating an over-limit body) is a 400, never a 500.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import { BUDGETS, consume } from "@spektrum/shared/rate-limit";
import { errorResponse } from "@/auth/route-errors";
import { importArchive } from "@/lib/import/import-archive";
import { limitsFromEnv } from "@/lib/import/limits";
import { ZipError } from "@/lib/import/zip";

export const runtime = "nodejs";

/** Fallback cap when `IMPORT_MAX_FILE_BYTES` is unset. */
const DEFAULT_MAX_BYTES = 30 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    assertSameOrigin(req, loadWebEnv().authUrl);

    const { allowed, retryAfterMs } = await consume(
      `import:${user.id}`,
      BUDGETS.import,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "retry-after": String(Math.ceil(retryAfterMs / 1000)) } },
      );
    }

    const limits = limitsFromEnv();
    // The proxy buffers the body before the route sees it, so the declared
    // length is the only cheap way to refuse an oversize upload.
    const cap = limits.maxFileBytes ?? DEFAULT_MAX_BYTES;
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > cap) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    const file = form.get("archive");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "bad_request", message: "multipart field 'archive' is required" },
        { status: 400 },
      );
    }
    if (file.size > cap) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const report = await importArchive(user.id, bytes, limits);
    return NextResponse.json({ report });
  } catch (e) {
    if (e instanceof ZipError) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }
    return errorResponse(e);
  }
}