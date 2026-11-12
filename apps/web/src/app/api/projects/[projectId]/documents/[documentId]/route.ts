import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import { errorResponse } from "@/auth/route-errors";
import {
  DocumentPathError,
  ProjectNotFoundError,
  StaleDocumentError,
  deleteDocument,
  getDocumentById,
  saveDocument,
} from "@/lib/documents";

// PATCH  /api/projects/:projectId/documents/:documentId
//   body { content, baseUpdatedAt } -> { documentId, updatedAt, revisionHash }
//   409 { error: "conflict", document } on a stale baseline (spec §19.2)
// DELETE /api/projects/:projectId/documents/:documentId -> 204
const saveSchema = z.object({
  content: z.string().max(524_288),
  baseUpdatedAt: z.string().datetime(),
});

type Ctx = { params: Promise<{ projectId: string; documentId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser();
    assertSameOrigin(req, loadWebEnv().authUrl);
    const { projectId, documentId } = await ctx.params;
    const body = saveSchema.parse(await req.json());
    const result = await saveDocument(
      user.id,
      projectId,
      documentId,
      body.content,
      body.baseUpdatedAt,
    );
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof StaleDocumentError) {
      return NextResponse.json(
        { error: "conflict", document: e.current },
        { status: 409 },
      );
    }
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

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser();
    assertSameOrigin(_req, loadWebEnv().authUrl);
    const { projectId, documentId } = await ctx.params;
    const existing = await getDocumentById(user.id, projectId, documentId);
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await deleteDocument(user.id, projectId, documentId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return errorResponse(e);
  }
}
