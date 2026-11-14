// Project document queries shared by the web app and the compile worker
// (spec §11.0: the database is the source of truth). Ownership scoping lives
// in the callers — the web layer checks `projects.owner_id` before calling.

import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "./client";
import { documents, projects } from "./schema";

export interface RevisionDocumentRow {
  path: string;
  content: string | null;
  blobKey: string | null;
}

/** Every document of a project, ordered by path, for the revision hash. */
export async function listRevisionDocuments(
  projectId: string,
): Promise<RevisionDocumentRow[]> {
  return db
    .select({
      path: documents.path,
      content: documents.content,
      blobKey: documents.blobKey,
    })
    .from(documents)
    .where(eq(documents.projectId, projectId))
    .orderBy(asc(documents.path));
}

export interface ContextDocumentRow {
  id: string;
  path: string;
  kind: string;
  blobKey: string | null;
  content: string | null;
}

/**
 * Every document of an owned project (manifest), with content only for the
 * paths the context builder needs. Blobs never load content.
 */
export async function listContextDocuments(
  projectId: string,
  userId: string,
  contentPaths: string[],
): Promise<ContextDocumentRow[]> {
  const rows = await db
    .select({
      id: documents.id,
      path: documents.path,
      kind: documents.kind,
      blobKey: documents.blobKey,
    })
    .from(documents)
    .innerJoin(
      projects,
      and(
        eq(documents.projectId, projects.id),
        eq(projects.ownerId, userId),
        isNull(projects.deletedAt),
      ),
    )
    .where(eq(documents.projectId, projectId))
    .orderBy(asc(documents.path));

  if (rows.length === 0) return [];

  const wanted = [...new Set(contentPaths)].filter((path) => path.length > 0);
  const contents =
    wanted.length === 0
      ? []
      : await db
          .select({ path: documents.path, content: documents.content })
          .from(documents)
          .where(
            and(
              eq(documents.projectId, projectId),
              inArray(documents.path, wanted),
              isNotNull(documents.content),
            ),
          );
  const byPath = new Map(contents.map((row) => [row.path, row.content]));
  return rows.map((row) => ({
    ...row,
    content: byPath.get(row.path) ?? null,
  }));
}