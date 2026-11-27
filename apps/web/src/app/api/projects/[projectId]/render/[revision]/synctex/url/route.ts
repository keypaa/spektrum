// GET /api/projects/:projectId/render/:revision/synctex/url
//   -> { url }: short-lived signed GET for the owner's SyncTeX object.
// Ownership is resolved from the session before a URL is minted; no raw key
// from the browser is ever accepted.
import { NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { errorResponse } from "@/auth/route-errors";
import { getRender } from "@/lib/render-store";
import { presignDownload } from "@spektrum/storage";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVISION_RE = /^[0-9a-f]{64}$/;

export async function GET(
  _req: Request,
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
    const url = await presignDownload("pdf", found.synctexKey);
    return NextResponse.json({ url });
  } catch (e) {
    return errorResponse(e);
  }
}
