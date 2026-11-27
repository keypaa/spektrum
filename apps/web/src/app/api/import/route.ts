// POST /api/import — Prism archive import (spec §13.2).
//
// The archive arrives as a signed R2 key, never in the request body: on the
// serverless plan Vercel caps request bodies at 4.5 MB. Guards run before the
// bytes are read: session -> same-origin -> rate limit -> body -> scoped key ->
// object -> magic bytes. A parse failure is a 400, never a 500.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getObject, StorageError } from "@spektrum/storage";
import { requireUser } from "@/auth/session";
import { assertSameOrigin } from "@spektrum/shared/http/guard";
import { loadWebEnv } from "@spektrum/shared/env";
import { BUDGETS, consume } from "@spektrum/shared/rate-limit";
import { errorResponse } from "@/auth/route-errors";
import { importArchive } from "@/lib/import/import-archive";
import { limitsFromEnv } from "@/lib/import/limits";
import { assertZipMagic, SniffError } from "@/lib/upload/sniff";
import { assertScopedKey } from "@/lib/upload/scoped-key";
import { MAX_UPLOAD_BYTES } from "@/lib/upload/quotas";
import { ZipError } from "@/lib/import/zip";

export const runtime = "nodejs";

const CONTENT_TYPE = z.string().min(1).max(255).regex(/^[\x20-\x7e]+$/);

export const importBodySchema = z.object({
  name: z.string().min(1).max(1024),
  blobKey: z.string().min(1),
  contentType: CONTENT_TYPE.optional(),
});
export type ImportBody = z.infer<typeof importBodySchema>;

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    assertSameOrigin(req, loadWebEnv().authUrl);

    const { allowed, retryAfterMs } = await consume(
      `import:${user.id}`,
      BUDGETS.import,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "retry-after": String(Math.ceil(retryAfterMs / 1000)) } },
      );
    }

    const limits = limitsFromEnv();
    // The JSON body is tiny, but keep the declared-length guard: a proxy that
    // buffers an oversize body must never reach the importer. `limits` still
    // governs the entries *inside* the archive (readZip/parsePrismArchive).
    const cap = MAX_UPLOAD_BYTES.import;
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > cap) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }

    const body: ImportBody = importBodySchema.parse(await req.json());
    // The key is a bearer credential minted by /api/uploads/sign. Re-check its
    // shape against this user before reading anything out of the bucket.
    if (!assertScopedKey(user.id, "import", body.blobKey)) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    let object: Awaited<ReturnType<typeof getObject>>;
    try {
      object = await getObject("uploads", body.blobKey);
    } catch (e) {
      if (e instanceof StorageError) {
        return NextResponse.json({ error: "bad_request" }, { status: 400 });
      }
      throw e;
    }
    // A presigned PUT cannot enforce content-length: the actual object decides.
    if (object.size > cap) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }

    const bytes = new Uint8Array(object.body);
    // Content type is decided from the bytes, not the file name or the client's
    // declared type.
    try {
      assertZipMagic(bytes);
    } catch (e) {
      if (e instanceof SniffError) {
        return NextResponse.json({ error: "bad_request" }, { status: 400 });
      }
      throw e;
    }

    // The quota was already charged when /api/uploads/sign minted this key;
    // charging again here would consume twice the bytes for one file.
    const report = await importArchive(user.id, bytes, limits);
    return NextResponse.json({ report });
  } catch (e) {
    // Only a size cap is a 413; a corrupt archive, too many entries or a
    // suspicious ratio are client errors and must not tell the user their
    // archive was too large.
    if (e instanceof ZipError) {
      return NextResponse.json(
        { error: e.code === "too_large" ? "too_large" : "bad_request" },
        { status: e.code === "too_large" ? 413 : 400 },
      );
    }
    return errorResponse(e);
  }
}
