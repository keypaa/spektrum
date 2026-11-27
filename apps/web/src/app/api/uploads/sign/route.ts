// POST /api/uploads/sign — mint a short-lived signed PUT URL for a direct R2
// upload (serverless plan Task 3). The browser PUTs the bytes itself, then
// posts only the returned key to a later route; those routes must re-check the
// key with assertScopedKey and the object's actual size before persisting it.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth/session";
import { errorResponse } from "@/auth/route-errors";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import { presignUpload } from "@spektrum/storage";
import { scopedKey, UPLOAD_KINDS } from "@/lib/upload/scoped-key";
import { consumeStorageQuota, MAX_UPLOAD_BYTES } from "@/lib/upload/quotas";

export const runtime = "nodejs";

// Keep the extension rule in sync with scoped-key.ts: the server must never
// mint a key that assertScopedKey would later reject.
const EXT = /^[a-z0-9]{1,16}$/;

export const signUploadBodySchema = z.object({
  kind: z.enum(UPLOAD_KINDS),
  ext: z.string().regex(EXT),
  contentType: z.string().min(1).max(255).regex(/^[\x20-\x7e]+$/),
  sizeBytes: z.number().int().positive(),
});

export type SignUploadBody = z.infer<typeof signUploadBodySchema>;
export type SignUploadResult = {
  key: string;
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
};

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    assertSameOrigin(req, loadWebEnv().authUrl);

    const body: SignUploadBody = signUploadBodySchema.parse(await req.json());
    // A presigned PUT cannot carry a content-length range: reject the declared
    // size here, and rely on getObject checks downstream for the actual bytes.
    const maxBytes = MAX_UPLOAD_BYTES[body.kind];
    if (body.sizeBytes > maxBytes) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }

    const quota = await consumeStorageQuota(user.id, body.sizeBytes);
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

    // All signed uploads land in the uploads bucket. Rendered PDFs produced by
    // the worker are written to the pdf bucket and are not signed here.
    const key = scopedKey(user.id, body.kind, body.ext);
    const { url, headers, expiresAt } = await presignUpload({
      bucket: "uploads",
      key,
      contentType: body.contentType,
      maxBytes,
    });
    const result: SignUploadResult = {
      key,
      url,
      headers,
      expiresAt: expiresAt.toISOString(),
    };
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
