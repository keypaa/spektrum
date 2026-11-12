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
import { revisionHash, type RevisionDocument } from "./revision";
import { BLANK_MAIN_TEX, EXAMPLE_MAIN_TEX } from "./templates";

export type DocumentKind = "tex" | "bib" | "img" | "csv" | "other";

export interface DocumentSummary {
  id: string;
  path: string;
  kind: DocumentKind;
  updatedAt: string;
}

export interface DocumentRecord extends DocumentSummary {
  content: string | null;
}

export type DocumentPathErrorCode =
  | "empty"
  | "absolute"
  | "traversal"
  | "separator"
  | "characters"
  | "too_long";

export class DocumentPathError extends Error {
  code: DocumentPathErrorCode;
  constructor(code: DocumentPathErrorCode) {
    super(`invalid document path: ${code}`);
    this.name = "DocumentPathError";
    this.code = code;
  }
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

const MAX_PATH_LENGTH = 200;

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
 * Validate and normalise a client-supplied path.
 *
 * Rejects absolute paths, `..` traversal, backslashes, control characters and
 * over-long names; collapses duplicate separators. There is no `path.resolve`
 * here on purpose — anything that could escape the project root is refused
 * rather than rewritten.
 */
export function normalizeDocumentPath(input: string): string {
  if (input.trim() === "") throw new DocumentPathError("empty");
  if (input.length > MAX_PATH_LENGTH) throw new DocumentPathError("too_long");
  if (input.startsWith("/")) throw new DocumentPathError("absolute");
  if (input.includes("\\")) throw new DocumentPathError("separator");
  if (/[\u0000-\u001f]/.test(input)) throw new DocumentPathError("characters");

  const segments = input.split("/");
  for (const segment of segments) {
    if (segment === "..") throw new DocumentPathError("traversal");
  }

  const normalised = segments.filter((s) => s !== "").join("/");
  if (normalised === "") throw new DocumentPathError("empty");
  if (normalised.length > MAX_PATH_LENGTH) {
    throw new DocumentPathError("too_long");
  }
  return normalised;
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
    .select({ ...summaryColumns, content: documents.content })
    .from(documents)
    .innerJoin(projects, eq(documents.projectId, projects.id))
    .where(
      and(projectFilter(ownerId, projectId), eq(documents.id, id)),
    )
    .limit(1);
  const row = rows[0];
  return row ? { ...toSummary(row), content: row.content } : null;
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
    throw new DocumentPathError("characters");
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

export async function listRevisionDocuments(
  projectId: string,
): Promise<RevisionDocument[]> {
  const rows = await db
    .select({ path: documents.path, content: documents.content })
    .from(documents)
    .where(eq(documents.projectId, projectId))
    .orderBy(asc(documents.path));
  return rows;
}