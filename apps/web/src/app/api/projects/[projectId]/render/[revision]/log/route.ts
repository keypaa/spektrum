import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { errorResponse } from "@/auth/route-errors";
import { getRenderLog } from "@/lib/render-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVISION_RE = /^[0-9a-f]{64}$/;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ projectId: string; revision: string }> },
) {
  try {
    const user = await requireUser();
    const { projectId, revision } = await ctx.params;
    if (!UUID_RE.test(projectId) || !REVISION_RE.test(revision)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const log = await getRenderLog(user.id, projectId, revision);
    if (log === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ log });
  } catch (e) {
    return errorResponse(e);
  }
}