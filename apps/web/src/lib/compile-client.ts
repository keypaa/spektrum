// Browser-side compile client. The engine runs in this tab, so this module
// collects the project files, drives `compileInBrowser`, uploads the artefacts
// through signed URLs and posts only the resulting keys to the ownership-
// checked commit route. No server render job exists on this branch.

import type { RenderEvent } from "@spektrum/shared/compile";
import type { DocumentRecord, DocumentSummary } from "@/lib/documents";
import { getDocumentRequest } from "@/lib/document-client";
import { uploadBytesToR2 } from "@/lib/upload/client";
import type { CommitRenderBody } from "@/lib/render-commit";
import {
  compileInBrowser,
  type CompileInput,
  type CompileOutcome,
} from "@/lib/compile/wasm-engine";

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `request failed: ${res.status}`;
  } catch {
    return `request failed: ${res.status}`;
  }
}

/** Ask the server to accept this compile (revision + rate limits). */
export async function requestCompile(
  projectId: string,
  mainFile: string,
  force = false,
): Promise<{ revision: string; cached: boolean }> {
  const res = await fetch(`/api/projects/${projectId}/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mainFile, force }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { revision: string; cached: boolean };
}

/** Materialise every project document into the engine's input map. */
export async function loadCompileFiles(
  projectId: string,
): Promise<CompileInput["files"]> {
  const res = await fetch(`/api/projects/${projectId}/tree`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { documents: DocumentSummary[] };
  const files: CompileInput["files"] = {};
  for (const doc of body.documents ?? []) {
    if (doc.kind === "img") {
      // Blob documents have no text content: read their bytes from the
      // owner-checked download route instead of handing the engine an empty
      // file (§11.2 materialisation).
      const download = await fetch(
        `/api/projects/${projectId}/documents/${doc.id}/download`,
      );
      if (!download.ok) throw new Error(await readError(download));
      files[doc.path] = new Uint8Array(await download.arrayBuffer());
      continue;
    }
    const record: DocumentRecord = await getDocumentRequest(projectId, doc.path);
    files[doc.path] = record.content ?? "";
  }
  return files;
}

/** Sign → PUT the compile artefacts. The keys are scoped by the server. */
export async function uploadRenderArtifacts(
  projectId: string,
  outcome: CompileOutcome,
): Promise<{ pdfKey: string; synctexKey: string | null }> {
  const pdfKey = await uploadBytesToR2({
    bytes: outcome.pdf,
    contentType: "application/pdf",
    kind: "render",
    ext: "pdf",
    projectId,
  });
  const synctexKey =
    outcome.synctex && outcome.synctex.byteLength > 0
      ? await uploadBytesToR2({
          bytes: outcome.synctex,
          contentType: "application/octet-stream",
          kind: "render",
          ext: "synctex",
          projectId,
        })
      : null;
  return { pdfKey, synctexKey };
}

/** Persist the committed render row (never the bytes themselves). */
export async function commitLocalRender(
  projectId: string,
  body: CommitRenderBody,
): Promise<{ revision: string }> {
  const res = await fetch(`/api/projects/${projectId}/renders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { revision: string };
}

let localPdfUrl: string | null = null;
let localPdfBytes: Uint8Array | null = null;

/** Object URL for the last local PDF, so pdfjs can render bytes without a round trip. */
export function createLocalPdfUrl(bytes: Uint8Array): string {
  if (localPdfUrl) URL.revokeObjectURL(localPdfUrl);
  localPdfUrl = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: "application/pdf" }),
  );
  localPdfBytes = bytes;
  return localPdfUrl;
}

/** Raw bytes of the last local compile, for the PDF chrome's download/open. */
export function getLocalPdfBytes(): Uint8Array | null {
  return localPdfBytes;
}

export type LocalCompileEmitter = (event: RenderEvent) => void;

/**
 * One local compile, from the accepted revision to the committed render row.
 * Every stage emits a RenderEvent so the existing pills, logs and banner keep
 * working; a failure emits `status: error` and deliberately does not commit.
 */
export async function runLocalCompile(
  projectId: string,
  mainFile: string,
  emit: LocalCompileEmitter,
): Promise<void> {
  let revision = "";
  try {
    const accepted = await requestCompile(projectId, mainFile);
    revision = accepted.revision;
    emit({ event: "status", state: "queued", revision });

    const files = await loadCompileFiles(projectId);
    emit({ event: "status", state: "running", revision });

    const outcome = await compileInBrowser({ files, mainFile });
    if (!outcome.ok) {
      emit({
        event: "status",
        state: "error",
        revision,
        diagnostics: outcome.diagnostics,
        log: outcome.log,
      });
      return;
    }

    const { pdfKey, synctexKey } = await uploadRenderArtifacts(projectId, outcome);
    await commitLocalRender(projectId, {
      revision,
      mainFile,
      pdfKey,
      synctexKey,
      log: outcome.log || null,
      diagnostics: outcome.diagnostics,
      stats: outcome.stats,
      durationMs: outcome.durationMs,
    });

    emit({
      event: "result",
      revision,
      pdfUrl: createLocalPdfUrl(outcome.pdf),
      diagnostics: outcome.diagnostics,
      stats: outcome.stats,
      durationMs: outcome.durationMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit({
      event: "status",
      state: "error",
      revision,
      message,
    });
  }
}
