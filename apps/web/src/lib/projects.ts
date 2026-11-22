import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@spektrum/db";
import { documents, folders, projects } from "@spektrum/db/schema";
import { BLANK_MAIN_TEX, EXAMPLE_MAIN_TEX } from "./templates";
import { deleteProjectChatImages } from "./ai/chat-store";

export interface ProjectRow {
  id: string;
  name: string;
  folderId: string | null;
  createdAt: Date;
}

export interface ProjectSummary {
  id: string;
  name: string;
  mainDocumentId: string | null;
}

export async function listProjects(ownerId: string): Promise<ProjectRow[]> {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      folderId: projects.folderId,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(and(eq(projects.ownerId, ownerId), isNull(projects.deletedAt)))
    .orderBy(desc(projects.createdAt));
}

/**
 * Create a project and seed its `main.tex` in one transaction, so a failed
 * seed leaves no project row behind. The caller sees a project that is either
 * fully usable or absent.
 */
export async function createProject(
  ownerId: string,
  name: string,
  template: "blank" | "example" = "blank",
): Promise<ProjectRow> {
  const content = template === "example" ? EXAMPLE_MAIN_TEX : BLANK_MAIN_TEX;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(projects)
      .values({ ownerId, name })
      .returning({
        id: projects.id,
        name: projects.name,
        folderId: projects.folderId,
        createdAt: projects.createdAt,
      });
    const [doc] = await tx
      .insert(documents)
      .values({ projectId: row!.id, path: "main.tex", kind: "tex", content })
      .returning({ id: documents.id });
    await tx
      .update(projects)
      .set({ mainDocumentId: doc!.id })
      .where(eq(projects.id, row!.id));
    return row!;
  });
}

/** The owning user's view of one project, or null if not visible to them. */
export async function getProject(
  ownerId: string,
  projectId: string,
): Promise<ProjectSummary | null> {
  const [row] = await db
    .select({
      id: projects.id,
      name: projects.name,
      mainDocumentId: projects.mainDocumentId,
    })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.ownerId, ownerId),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function renameProject(ownerId: string, id: string, name: string): Promise<void> {
  await db
    .update(projects)
    .set({ name })
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)));
}

/**
 * Duplicate a project's documents. Text content is copied; `blob_key` is not
 * (Phase 2 has no binary documents — see Appendix D). The duplicate's
 * `main_document_id` points at the copy of the source's main document.
 */
export async function duplicateProject(
  ownerId: string,
  id: string,
  name: string,
): Promise<ProjectRow> {
  const [source] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
    .limit(1);
  if (!source) throw new Error("project not found");

  const sourceDocs = await db
    .select({
      path: documents.path,
      kind: documents.kind,
      content: documents.content,
    })
    .from(documents)
    .where(eq(documents.projectId, id));

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(projects)
      .values({ ownerId, name })
      .returning({
        id: projects.id,
        name: projects.name,
        folderId: projects.folderId,
        createdAt: projects.createdAt,
      });
    let mainDocumentId: string | null = null;
    for (const doc of sourceDocs) {
      const [copy] = await tx
        .insert(documents)
        .values({
          projectId: row!.id,
          path: doc.path,
          kind: doc.kind,
          content: doc.content,
        })
        .returning({ id: documents.id });
      if (doc.path === "main.tex") mainDocumentId = copy!.id;
    }
    await tx
      .update(projects)
      .set({ mainDocumentId })
      .where(eq(projects.id, row!.id));
    return row!;
  });
}

export async function softDeleteProject(ownerId: string, id: string): Promise<void> {
  const [row] = await db
    .update(projects)
    .set({ deletedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
    .returning({ id: projects.id });
  // Only the owner's project loses its chat attachment blobs; a cross-tenant
  // no-op must not touch another owner's storage.
  if (row) await deleteProjectChatImages(id);
}

export async function createFolder(ownerId: string, name: string): Promise<string> {
  const [row] = await db.insert(folders).values({ ownerId, name }).returning({ id: folders.id });
  return row!.id;
}

export async function projectName(ownerId: string, id: string): Promise<string> {
  const [row] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
    .limit(1);
  return row?.name ?? "New Project";
}
