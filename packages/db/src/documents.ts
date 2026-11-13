// Project document queries shared by the web app and the compile worker
// (spec §11.0: the database is the source of truth). Ownership scoping lives
// in the callers — the web layer checks `projects.owner_id` before calling.

import { asc, eq } from "drizzle-orm";
import { db } from "./client";
import { documents } from "./schema";

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