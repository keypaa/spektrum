import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import { errorResponse } from "@/auth/route-errors";
import {
  DocumentPathError,
  DuplicatePathError,
  ProjectNotFoundError,
  renameDocument,
} from "@/lib/documents";

// POST /api/projects/:projectId/documents/:documentId/rename
//   body { path } -> { document }
const renameSchema = z.object({
  path: z.string().min(1).max(200),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string; documentId: string }> },
) {
  try {
    const user = await requireUser();
    assertSameOrigin(req, loadWebEnv().authUrl);
    const { projectId, documentId } = await ctx.params;
    if (!isUuid(projectId) || !isUuid(documentId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const body = renameSchema.parse(await req.json());
    const document = await renameDocument(user.id, projectId, documentId, body.path);
    return NextResponse.json({ document });
  } catch (e) {
    if (e instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof DuplicatePathError) {
      return NextResponse.json({ error: "duplicate_path" }, { status: 409 });
    }
    if (e instanceof DocumentPathError) {
      return NextResponse.json(
        { error: "bad_request", message: e.code },
        { status: 400 },
      );
    }
    return errorResponse(e);
  }
}
