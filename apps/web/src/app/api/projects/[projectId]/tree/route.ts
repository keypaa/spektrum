import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { errorResponse } from "@/auth/route-errors";
import { ProjectNotFoundError, listTree } from "@/lib/documents";

// GET /api/projects/:projectId/tree -> { documents: DocumentSummary[] }
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser();
    const { projectId } = await ctx.params;
    return NextResponse.json({ documents: await listTree(user.id, projectId) });
  } catch (e) {
    if (e instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return errorResponse(e);
  }
}
