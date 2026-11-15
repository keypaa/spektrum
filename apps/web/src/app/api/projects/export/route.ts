// GET /api/projects/export — every active project as one .zip (spec §13.3).
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { BUDGETS, consume } from "@spektrum/shared/rate-limit";
import { errorResponse } from "@/auth/route-errors";
import {
  buildAllExport,
  ExportTooLargeError,
} from "@/lib/export/build-export";

export const runtime = "nodejs";

function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/["\r\n]/g, "").replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(_req?: NextRequest) {
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

    const zip = await buildAllExport(user.id);
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
    if (e instanceof ExportTooLargeError) {
      return NextResponse.json(
        {
          error: "too_large",
          message:
            "These projects are too large to export in one archive. Export the projects individually.",
        },
        { status: 413 },
      );
    }
    return errorResponse(e);
  }
}