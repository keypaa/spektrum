import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { errorResponse } from "@/auth/route-errors";
import { ProjectNotFoundError, getDocumentById } from "@/lib/documents";

// GET /api/projects/:projectId/documents/:documentId/download
//   -> the document content as text/plain; charset=utf-8 with an attachment
//      Content-Disposition. The filename is the basename, JSON-quoted, with
//      any `"`/CR/LF stripped so it cannot break out of the header.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ projectId: string; documentId: string }> },
) {
  try {
    const user = await requireUser();
    const { projectId, documentId } = await ctx.params;
    const document = await getDocumentById(user.id, projectId, documentId);
    if (!document) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const basename = document.path.split("/").pop() ?? "document";
    const safe = basename.replace(/["\r\n]/g, "");
    const disposition = `attachment; filename=${JSON.stringify(safe)}`;
    return new NextResponse(document.content ?? "", {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": disposition,
      },
    });
  } catch (e) {
    if (e instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return errorResponse(e);
  }
}
