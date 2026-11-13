import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { errorResponse } from "@/auth/route-errors";
import { ProjectNotFoundError, listTree } from "@/lib/documents";

// GET /api/projects/:projectId/tree -> { documents: DocumentSummary[] }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser();
    const { projectId } = await ctx.params;
    if (!isUuid(projectId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ documents: await listTree(user.id, projectId) });
  } catch (e) {
    if (e instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return errorResponse(e);
  }
}
