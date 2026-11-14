import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import { errorResponse } from "@/auth/route-errors";
import { listSnapshots, restoreSnapshots } from "@spektrum/db/snapshots";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  ctx: {
    params: Promise<{ projectId: string; snapshotId: string }>;
  },
) {
  try {
    const user = await requireUser();
    assertSameOrigin(req, loadWebEnv().authUrl);
    const { projectId, snapshotId } = await ctx.params;
    if (!UUID_RE.test(projectId) || !UUID_RE.test(snapshotId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const rows = await listSnapshots(user.id, projectId);
    const row = rows.find((entry) => entry.id === snapshotId);
    if (!row?.batchId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await restoreSnapshots(user.id, projectId, row.batchId);
    const documents = rows
      .filter((entry) => entry.batchId === row.batchId)
      .map((entry) => ({ documentId: entry.documentId, path: entry.path }));
    return NextResponse.json({ documents });
  } catch (e) {
    return errorResponse(e);
  }
}