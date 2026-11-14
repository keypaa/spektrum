import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { errorResponse } from "@/auth/route-errors";
import { getRender } from "@/lib/render-store";
import { getObject } from "@spektrum/storage";

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
    const found = await getRender(user.id, projectId, revision);
    if (!found?.synctexKey) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const object = await getObject("pdf", found.synctexKey);
    return new Response(new Uint8Array(object.body), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}