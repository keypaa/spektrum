// POST /api/projects/:projectId/upload — workspace upload from signed R2 keys.
//
// Shared by drag-and-drop, the sidebar upload button and the composer's
// "Upload files & photos", so a chat attachment becomes a real workspace file
// exactly like a dropped PDF. The bytes never pass through the server: each
// key is re-checked against the session's user before its object is read.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getObject, StorageError } from "@spektrum/storage";
import { requireUser } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import { BUDGETS, consume } from "@spektrum/shared/rate-limit";
import { errorResponse } from "@/auth/route-errors";
import { ProjectNotFoundError, uploadFiles, type UploadInput } from "@/lib/documents";
import { assertScopedKey } from "@/lib/upload/scoped-key";
import { consumeStorageQuota, MAX_UPLOAD_BYTES } from "@/lib/upload/quotas";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTENT_TYPE = z.string().min(1).max(255).regex(/^[\x20-\x7e]+$/);

export const uploadBodySchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(1024),
        blobKey: z.string().min(1),
        contentType: CONTENT_TYPE.optional(),
      }),
    )
    .min(1),
});
export type UploadBody = z.infer<typeof uploadBodySchema>;

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

    const { allowed, retryAfterMs } = await consume(
      `upload:${user.id}`,
      BUDGETS.upload,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: { "retry-after": String(Math.ceil(retryAfterMs / 1000)) },
        },
      );
    }

    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES.workspace) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }

    const body: UploadBody = uploadBodySchema.parse(await req.json());
    // Validate every key before reading any object: one foreign key must not
    // make this request persist a sibling file that happened to be valid.
    if (!body.files.every((file) => assertScopedKey(user.id, "workspace", file.blobKey))) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    const files: UploadInput[] = [];
    for (const file of body.files) {
      let object: Awaited<ReturnType<typeof getObject>>;
      try {
        object = await getObject("uploads", file.blobKey);
      } catch (e) {
        if (e instanceof StorageError) {
          return NextResponse.json({ error: "bad_request" }, { status: 400 });
        }
        throw e;
      }
      // A presigned PUT cannot enforce content-length; the stored bytes can be
      // much larger than the declaration the signing route was given.
      if (object.size > MAX_UPLOAD_BYTES.workspace) {
        return NextResponse.json({ error: "too_large" }, { status: 413 });
      }
      files.push({
        name: file.name,
        bytes: new Uint8Array(object.body),
        contentType: file.contentType,
      });

      const quota = await consumeStorageQuota(user.id, object.size);
      if (!quota.allowed) {
        return NextResponse.json(
          { error: "rate_limited" },
          {
            status: 429,
            headers: {
              "retry-after": String(Math.max(1, Math.ceil(quota.retryAfterMs / 1000))),
            },
          },
        );
      }
    }

    const result = await uploadFiles(user.id, projectId, files);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return errorResponse(e);
  }
}
