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
  createDocument,
  getDocumentByPath,
} from "@/lib/documents";

// GET  /api/projects/:projectId/documents?path=... -> { document } (404 if absent)
// POST /api/projects/:projectId/documents  body { path } -> 201 { document }
const createSchema = z.object({
  path: z.string().min(1).max(200),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser();
    const { projectId } = await ctx.params;
    if (!isUuid(projectId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const path = new URL(req.url).searchParams.get("path");
    if (!path) {
      return NextResponse.json(
        { error: "bad_request", message: "missing path query parameter" },
        { status: 400 },
      );
    }
    const document = await getDocumentByPath(user.id, projectId, path);
    if (!document) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ document });
  } catch (e) {
    if (e instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
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

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser();
    assertSameOrigin(req, loadWebEnv().authUrl);
    const { projectId } = await ctx.params;
    if (!isUuid(projectId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const body = createSchema.parse(await req.json());
    const document = await createDocument(user.id, projectId, body.path);
    return NextResponse.json({ document }, { status: 201 });
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