import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@spektrum/db";
import { pdfRenders } from "@spektrum/db/schema";
import { requireUser } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import {
  BUDGETS,
  consume,
  getRedis,
} from "@spektrum/shared/rate-limit";
import { currentRevisionKey } from "@spektrum/shared/compile";
import { revisionHash } from "@spektrum/shared/revision";
import { errorResponse } from "@/auth/route-errors";
import { getProject } from "@/lib/projects";
import { getDocumentByPath, listRevisionDocuments } from "@/lib/documents";
import { enqueueCompile } from "@/lib/compile-queue";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodySchema = z.object({ mainFile: z.string().min(1).max(200) });

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser();
    assertSameOrigin(req, loadWebEnv().authUrl);
    const { projectId } = await ctx.params;
    if (!UUID_RE.test(projectId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const body = bodySchema.parse(await req.json());
    const project = await getProject(user.id, projectId);
    if (!project) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const main = await getDocumentByPath(user.id, projectId, body.mainFile);
    if (!main) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const revision = revisionHash(await listRevisionDocuments(projectId));

    const [cached] = await db
      .select({ id: pdfRenders.id })
      .from(pdfRenders)
      .where(
        and(
          eq(pdfRenders.projectId, projectId),
          eq(pdfRenders.revisionHash, revision),
          eq(pdfRenders.status, "ok"),
        ),
      );
    if (cached) {
      return NextResponse.json({ revision, cached: true });
    }

    const limit = await consume(`compile:${user.id}`, BUDGETS.compile);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
          },
        },
      );
    }

    await getRedis().set(currentRevisionKey(projectId), revision);
    await enqueueCompile({
      projectId,
      revisionHash: revision,
      mainFile: main.path,
    });
    return NextResponse.json({ revision }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}