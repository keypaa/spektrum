import { NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { errorResponse } from "@/auth/route-errors";
import { getProject } from "@/lib/projects";
import { listThreads } from "@/lib/ai/chat-store";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const { projectId } = await ctx.params;
    if (!UUID_RE.test(projectId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (!(await getProject(user.id, projectId))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({
      threads: await listThreads({ projectId, userId: user.id }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}