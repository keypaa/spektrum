// Server-side render commits (serverless plan Task 7). The browser compiles
// locally and uploads its artefacts through signed keys; this is the only path
// that turns those keys into a `pdf_renders` row.
//
// Ownership is checked twice, deliberately: `getProject` proves the caller may
// write to this project, and `assertScopedKey` proves every object key belongs
// to the same user and is of the `render` kind. Only then do we read the
// objects, so a foreign key can never make us persist a sibling artefact.

import { db } from "@spektrum/db";
import { pdfRenders } from "@spektrum/db/schema";
import { getObject, StorageError } from "@spektrum/storage";
import type { Diagnostic, ProjectStats } from "@spektrum/shared/compile";
import { getProject } from "./projects";
import { MAX_UPLOAD_BYTES } from "./upload/quotas";
import { assertScopedKey } from "./upload/scoped-key";

export type CommitRenderBody = {
  revision: string;
  mainFile: string;
  pdfKey: string;
  synctexKey: string | null;
  log: string | null;
  diagnostics: Diagnostic[] | null;
  stats: ProjectStats | null;
  durationMs: number | null;
};

export type CommitRenderErrorCode = "not_found" | "bad_request" | "too_large";

/** Mapped to HTTP status by the commit route; never leaks storage details. */
export class CommitRenderError extends Error {
  constructor(readonly code: CommitRenderErrorCode) {
    super(code);
    this.name = "CommitRenderError";
  }
}

export async function commitRender(
  userId: string,
  projectId: string,
  body: CommitRenderBody,
): Promise<{ revision: string }> {
  const project = await getProject(userId, projectId);
  if (!project) throw new CommitRenderError("not_found");

  const keys = [body.pdfKey, body.synctexKey].filter(
    (key): key is string => key !== null,
  );
  // Validate every key before reading any object: one foreign key must not
  // make this request persist a sibling artefact that happened to be valid.
  if (!keys.every((key) => assertScopedKey(userId, "render", key))) {
    throw new CommitRenderError("bad_request");
  }

  for (const key of keys) {
    let object: Awaited<ReturnType<typeof getObject>>;
    try {
      // Render PDFs and SyncTeX maps are signed into the `pdf` bucket.
      object = await getObject("pdf", key);
    } catch (error) {
      if (error instanceof StorageError) {
        throw new CommitRenderError("bad_request");
      }
      throw error;
    }
    // A presigned PUT cannot enforce content-length; the stored bytes may be
    // far larger than the declaration the signing route was given.
    if (object.size > MAX_UPLOAD_BYTES.render) {
      throw new CommitRenderError("too_large");
    }
  }

  await db
    .insert(pdfRenders)
    .values({
      projectId,
      revisionHash: body.revision,
      mainFile: body.mainFile,
      pdfKey: body.pdfKey,
      synctexKey: body.synctexKey,
      status: "ok",
      log: body.log,
      diagnostics: body.diagnostics,
      // `CompileOutcome.stats` is null until a real mapper exists; never
      // translate SDK perf numbers into invented word/figure counts.
      stats: body.stats,
      durationMs: body.durationMs,
    })
    .onConflictDoUpdate({
      target: [pdfRenders.projectId, pdfRenders.revisionHash],
      set: {
        mainFile: body.mainFile,
        pdfKey: body.pdfKey,
        synctexKey: body.synctexKey,
        status: "ok",
        log: body.log,
        diagnostics: body.diagnostics,
        stats: body.stats,
        durationMs: body.durationMs,
      },
    });

  return { revision: body.revision };
}
