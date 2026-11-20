// POST /api/projects/:projectId/upload — multipart workspace upload.
//
// Shared by drag-and-drop, the sidebar upload button and the composer's
// "Upload files & photos", so a chat attachment becomes a real workspace file
// exactly like a dropped PDF. Guards mirror /api/import: session -> same-origin
// -> rate limit -> declared length -> parse.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import { BUDGETS, consume } from "@spektrum/shared/rate-limit";
import { errorResponse } from "@/auth/route-errors";
import { ProjectNotFoundError, uploadFiles } from "@/lib/documents";

export const runtime = "nodejs";

const MAX_BYTES = 30 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser();
    assertSameOrigin(req, loadWebEnv().authUrl);
    const { projectId } = await ctx.params;
    if (!UUID_RE.test(projectId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const { allowed, retryAfterMs } = await consume(
      `upload:${user.id}`,
      BUDGETS.upload,
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

    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    const files = form
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) {
      return NextResponse.json(
        { error: "bad_request", message: "multipart field 'files' is required" },
        { status: 400 },
      );
    }
    if (files.some((file) => file.size > MAX_BYTES)) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }

    const result = await uploadFiles(
      user.id,
      projectId,
      await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
          contentType: file.type || undefined,
        })),
      ),
    );
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return errorResponse(e);
  }
}
