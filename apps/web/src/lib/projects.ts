import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@spektrum/db";
import { folders, projects } from "@spektrum/db/schema";

export interface ProjectRow {
  id: string;
  name: string;
  folderId: string | null;
  createdAt: Date;
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

export async function createProject(ownerId: string, name: string): Promise<ProjectRow> {
  const [row] = await db
    .insert(projects)
    .values({ ownerId, name })
    .returning({
      id: projects.id,
      name: projects.name,
      folderId: projects.folderId,
      createdAt: projects.createdAt,
    });
  return row!;
}

export async function renameProject(ownerId: string, id: string, name: string): Promise<void> {
  await db
    .update(projects)
    .set({ name })
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)));
}

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
  return createProject(source.ownerId, name);
}

export async function softDeleteProject(ownerId: string, id: string): Promise<void> {
  await db
    .update(projects)
    .set({ deletedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)));
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
