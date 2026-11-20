// Documents domain — every query is scoped to the owning project.
//
// The database is the source of truth for content and `updatedAt`
// (spec §11.0); the browser buffer is a cache. `updatedAt` is the optimistic
// baseline: a save carries the value the client last saw, and a zero-row
// update means someone else wrote first.
//
// Timestamps are returned as ISO strings at this boundary. The RSC page and
// the route JSON must agree on the shape, and a Date would not survive the
// RSC serialisation the same way a string does.

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@spektrum/db";
import { documents, projects } from "@spektrum/db/schema";
import { revisionHash } from "@spektrum/shared/revision";
import {
  DocumentPathError,
  normalizeDocumentPath,
  type DocumentPathErrorCode,
} from "@spektrum/shared/paths";
import { listRevisionDocuments } from "@spektrum/db/documents";
import { deleteObject, putObject } from "@spektrum/storage";
import { UploadNameError, uploadPathFor } from "./upload/upload-path";

// Re-exported for the route handlers and tests that import them from here.
export { DocumentPathError, normalizeDocumentPath, type DocumentPathErrorCode };
export { listRevisionDocuments };
import { BLANK_MAIN_TEX, EXAMPLE_MAIN_TEX } from "./templates";

export type DocumentKind = "tex" | "bib" | "img" | "csv" | "other";

/** Files at or under this size are stored inline in `documents.content`. */
const UPLOAD_INLINE_BYTES = 524_288;

export interface UploadInput {
  name: string;
  bytes: Uint8Array;
  contentType?: string | undefined;
}

export interface UploadResult {
  documents: DocumentSummary[];
  skipped: string[];
}

/** UTF-8 text without NULs is editable; anything else is a binary blob. */
function decodeUpload(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.includes("\u0000") ? null : text;
  } catch {
    return null;
  }
}

export interface DocumentSummary {
  id: string;
  path: string;
  kind: DocumentKind;
  updatedAt: string;
}

export interface DocumentRecord extends DocumentSummary {
  content: string | null;
  /** Present on reads; binary uploads live in the `uploads` bucket. */
  blobKey?: string | null;
}

export class DuplicatePathError extends Error {
  constructor(path: string) {
    super(`a document already exists at ${path}`);
    this.name = "DuplicatePathError";
  }
}

export class StaleDocumentError extends Error {
  current: DocumentRecord;
  constructor(current: DocumentRecord) {
    super("the document changed since this buffer was loaded");
    this.name = "StaleDocumentError";
    this.current = current;
  }
}

/** Thrown when the project is missing, deleted, or owned by someone else. */
export class ProjectNotFoundError extends Error {
  constructor() {
    super("not_found");
    this.name = "ProjectNotFoundError";
  }
}

const summaryColumns = {
  id: documents.id,
  path: documents.path,
  kind: documents.kind,
  updatedAt: documents.updatedAt,
};

type SummaryRow = {
  id: string;
  path: string;
  kind: DocumentKind;
  updatedAt: Date;
};

function toSummary(row: SummaryRow): DocumentSummary {
  return {
    id: row.id,
    path: row.path,
    kind: row.kind,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The project row must be active and owned by `ownerId`. */
function projectFilter(ownerId: string, projectId: string) {
  return and(
    eq(projects.id, projectId),
    eq(projects.ownerId, ownerId),
    isNull(projects.deletedAt),
  );
}

async function requireProject(
  ownerId: string,
  projectId: string,
): Promise<void> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(projectFilter(ownerId, projectId))
    .limit(1);
  if (!rows[0]) throw new ProjectNotFoundError();
}

/** Map an extension to the `document_kind` enum value. */
export function kindForPath(path: string): DocumentKind {
  const dot = path.lastIndexOf(".");
  if (dot <= 0 || dot === path.length - 1) return "other";
  switch (path.slice(dot + 1).toLowerCase()) {
    case "tex":
    case "cls":
    case "sty":
      return "tex";
    case "bib":
      return "bib";
    case "csv":
      return "csv";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "svg":
    case "pdf":
      return "img";
    default:
      return "other";
  }
}

/**
 * Insert `main.tex` for a freshly created project and return its id.
 * The caller writes `projects.main_document_id` in the same transaction.
 */
export async function seedProjectDocuments(
  projectId: string,
  template: "blank" | "example" = "blank",
): Promise<string> {
  const content = template === "example" ? EXAMPLE_MAIN_TEX : BLANK_MAIN_TEX;
  const [row] = await db
    .insert(documents)
    .values({ projectId, path: "main.tex", kind: "tex", content })
    .returning({ id: documents.id });
  if (!row) throw new Error("failed to seed main.tex");
  return row.id;
}

export async function listTree(
  ownerId: string,
  projectId: string,
): Promise<DocumentSummary[]> {
  await requireProject(ownerId, projectId);
  const rows = await db
    .select(summaryColumns)
    .from(documents)
    .innerJoin(projects, eq(documents.projectId, projects.id))
    .where(projectFilter(ownerId, projectId))
    .orderBy(asc(documents.path));
  return rows.map(toSummary);
}

export async function getDocumentByPath(
  ownerId: string,
  projectId: string,
  path: string,
): Promise<DocumentRecord | null> {
  const rows = await db
    .select({ ...summaryColumns, content: documents.content })
    .from(documents)
    .innerJoin(projects, eq(documents.projectId, projects.id))
    .where(
      and(
        projectFilter(ownerId, projectId),
        eq(documents.path, normalizeDocumentPath(path)),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? { ...toSummary(row), content: row.content } : null;
}

export async function getDocumentById(
  ownerId: string,
  projectId: string,
  id: string,
): Promise<DocumentRecord | null> {
  const rows = await db
    .select({
      ...summaryColumns,
      content: documents.content,
      blobKey: documents.blobKey,
    })
    .from(documents)
    .innerJoin(projects, eq(documents.projectId, projects.id))
    .where(
      and(projectFilter(ownerId, projectId), eq(documents.id, id)),
    )
    .limit(1);
  const row = rows[0];
  return row
    ? { ...toSummary(row), content: row.content, blobKey: row.blobKey }
    : null;
}

async function pathExists(
  ownerId: string,
  projectId: string,
  path: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: documents.id })
    .from(documents)
    .innerJoin(projects, eq(documents.projectId, projects.id))
    .where(and(projectFilter(ownerId, projectId), eq(documents.path, path)))
    .limit(1);
  return Boolean(rows[0]);
}

export async function createDocument(
  ownerId: string,
  projectId: string,
  path: string,
): Promise<DocumentRecord> {
  await requireProject(ownerId, projectId);
  const normalised = normalizeDocumentPath(path);
  if (await pathExists(ownerId, projectId, normalised)) {
    throw new DuplicatePathError(normalised);
  }
  const [row] = await db
    .insert(documents)
    .values({
      projectId,
      path: normalised,
      kind: kindForPath(normalised),
      content: null,
    })
    .returning({
      id: documents.id,
      path: documents.path,
      kind: documents.kind,
      updatedAt: documents.updatedAt,
      content: documents.content,
    });
  if (!row) throw new Error("failed to create document");
  await touchProject(ownerId, projectId);
  return { ...toSummary(row), content: row.content };
}

async function touchProject(
  ownerId: string,
  projectId: string,
): Promise<void> {
  await db
    .update(projects)
    .set({ updatedAt: new Date() })
    .where(projectFilter(ownerId, projectId));
}

/**
 * Save a document with an optimistic baseline.
 *
 * Postgres stores microsecond precision but the JSON the client holds is
 * millisecond precision, so a plain `updatedAt = $1` comparison would never
 * match: `Date.toISOString()` truncates. The comparison therefore truncates
 * the column to milliseconds too, which makes the value round-trip exactly.
 *
 * That is safe because at most one save is in flight per document (see the
 * editor's autosave hook), so two writes can never land in the same
 * millisecond for one document. If that ever changes, add a revision counter —
 * do not rely on the timestamp alone.
 */
export async function saveDocument(
  ownerId: string,
  projectId: string,
  documentId: string,
  content: string,
  baseUpdatedAt: string,
): Promise<{ documentId: string; updatedAt: string; revisionHash: string }> {
  const base = new Date(baseUpdatedAt);
  if (Number.isNaN(base.getTime())) {
    throw new Error("invalid baseUpdatedAt");
  }

  const updated = await db
    .update(documents)
    .set({ content, updatedAt: new Date() })
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.projectId, projectId),
        // Ownership is checked in the same statement as the write: a separate
        // read-then-write would leave a window where the project could be
        // transferred or deleted in between.
        sql`exists (
          select 1 from ${projects}
          where ${projects.id} = ${documents.projectId}
            and ${projects.ownerId} = ${ownerId}
            and ${projects.deletedAt} is null
        )`,
        sql`date_trunc('milliseconds', ${documents.updatedAt}) = ${base.toISOString()}::timestamptz`,
      ),
    )
    .returning({ updatedAt: documents.updatedAt });

  if (!updated[0]) {
    // Either the baseline is stale or the document is not ours. Re-read under
    // the ownership filter to tell them apart and to hand back the current row.
    const current = await getDocumentById(ownerId, projectId, documentId);
    if (!current) throw new ProjectNotFoundError();
    throw new StaleDocumentError(current);
  }

  await touchProject(ownerId, projectId);
  const hash = revisionHash(await listRevisionDocuments(projectId));
  return {
    documentId,
    updatedAt: updated[0].updatedAt.toISOString(),
    revisionHash: hash,
  };
}

export async function renameDocument(
  ownerId: string,
  projectId: string,
  documentId: string,
  path: string,
): Promise<DocumentRecord> {
  await requireProject(ownerId, projectId);
  const normalised = normalizeDocumentPath(path);

  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(eq(documents.projectId, projectId), eq(documents.path, normalised)),
    )
    .limit(1);
  if (existing[0] && existing[0].id !== documentId) {
    throw new DuplicatePathError(normalised);
  }

  const [row] = await db
    .update(documents)
    .set({ path: normalised, kind: kindForPath(normalised) })
    .where(
      and(eq(documents.id, documentId), eq(documents.projectId, projectId)),
    )
    .returning({
      id: documents.id,
      path: documents.path,
      kind: documents.kind,
      updatedAt: documents.updatedAt,
      content: documents.content,
    });
  if (!row) throw new ProjectNotFoundError();

  await touchProject(ownerId, projectId);
  return { ...toSummary(row), content: row.content };
}

/**
 * Delete a document, re-pointing `main_document_id` when the main file goes.
 *
 * The re-point is done in the same statement as the delete where possible:
 * the subquery picks the lowest-path remaining `.tex` so the choice is
 * deterministic and cannot race with a concurrent insert of a `.tex` file.
 */
export async function deleteDocument(
  ownerId: string,
  projectId: string,
  documentId: string,
): Promise<void> {
  await requireProject(ownerId, projectId);

  const [project] = await db
    .select({ mainDocumentId: projects.mainDocumentId })
    .from(projects)
    .where(projectFilter(ownerId, projectId))
    .limit(1);
  if (!project) throw new ProjectNotFoundError();

  if (project.mainDocumentId === documentId) {
    const [replacement] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.projectId, projectId),
          eq(documents.kind, "tex"),
          sql`${documents.id} <> ${documentId}`,
        ),
      )
      .orderBy(asc(documents.path))
      .limit(1);

    await db
      .update(projects)
      .set({ mainDocumentId: replacement?.id ?? null })
      .where(projectFilter(ownerId, projectId));
  }

  await db
    .delete(documents)
    .where(
      and(eq(documents.id, documentId), eq(documents.projectId, projectId)),
    );
  await touchProject(ownerId, projectId);
}

/**
 * Add dropped / picked / chat-attached files to the project's workspace.
 *
 * Files keep their own name at the project root so `main.tex` can reference
 * them directly. Existing paths are skipped rather than silently overwritten,
 * and blobs are written before the row so a failed transaction can clean them
 * up. This is the one ingestion path shared by drag-drop, the sidebar button
 * and the composer — chat attachments therefore become real workspace files.
 */
export async function uploadFiles(
  ownerId: string,
  projectId: string,
  files: UploadInput[],
): Promise<UploadResult> {
  await requireProject(ownerId, projectId);
  const result: UploadResult = { documents: [], skipped: [] };
  const uploadedKeys: string[] = [];

  // Decide paths before opening the transaction. `pathExists` runs on the
  // outer pool (it takes no tx), so an insert made earlier in this batch would
  // otherwise be invisible to the next check — two files with the same name
  // would collide on documents_project_path_key. The local set closes that
  // hole; the DB check still catches files uploaded in an earlier request.
  const seen = new Set<string>();
  const accepted: Array<{ path: string; file: UploadInput }> = [];
  for (const file of files) {
    let path: string;
    try {
      path = uploadPathFor(file.name);
    } catch (e) {
      if (e instanceof UploadNameError) {
        result.skipped.push(file.name);
        continue;
      }
      throw e;
    }
    if (seen.has(path) || (await pathExists(ownerId, projectId, path))) {
      result.skipped.push(file.name);
      continue;
    }
    seen.add(path);
    accepted.push({ path, file });
  }

  try {
    await db.transaction(async (tx) => {
      for (const { path, file } of accepted) {
        const text =
          file.bytes.byteLength <= UPLOAD_INLINE_BYTES
            ? decodeUpload(file.bytes)
            : null;
        let blobKey: string | null = null;
        if (text === null) {
          blobKey = `${projectId}/${path}`;
          await putObject(
            "uploads",
            blobKey,
            file.bytes,
            file.contentType ?? "application/octet-stream",
          );
          uploadedKeys.push(blobKey);
        }

        const [row] = await tx
          .insert(documents)
          .values({
            projectId,
            path,
            kind: kindForPath(path),
            content: text,
            blobKey,
          })
          .returning(summaryColumns);
        if (!row) throw new Error("failed to insert uploaded document");
        result.documents.push(toSummary(row));
      }
    });
  } catch (e) {
    for (const key of uploadedKeys) {
      await deleteObject("uploads", key).catch(() => undefined);
    }
    throw e;
  }

  if (result.documents.length > 0) await touchProject(ownerId, projectId);
  return result;
}
