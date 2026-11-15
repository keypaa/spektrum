// GET /api/projects/:projectId/export — one Prism project as a .zip (spec §13.3).
//
// Ownership failure is a 404, never a 403: a 403 would confirm the project
// exists for someone else.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { BUDGETS, consume } from "@spektrum/shared/rate-limit";
import { errorResponse } from "@/auth/route-errors";
import { buildProjectExport } from "@/lib/export/build-export";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ASCII fallback + `filename*` so non-ASCII names survive. */
function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/["\r\n]/g, "").replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser();
    const { allowed, retryAfterMs } = await consume(
      `export:${user.id}`,
      BUDGETS.export,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: { "retry-after": String(Math.ceil(retryAfterMs / 1000)) },
        },
      );
    }

    const { projectId } = await ctx.params;
    if (!UUID_RE.test(projectId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const zip = await buildProjectExport(user.id, projectId);
    if (!zip) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return new NextResponse(zip.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": contentDisposition(zip.fileName),
        "content-length": String(zip.bytes.byteLength),
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}