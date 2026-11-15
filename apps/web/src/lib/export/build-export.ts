// Prism export builder (spec §13.3).
//
// The archive is a re-importable Prism project: every document at its project
// path plus a `spektrum-export.json` manifest. Directory segments are
// sanitised so a hostile project name (`../x`) cannot produce an entry that a
// later import would treat as traversal — the manifest keeps the real name.
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@spektrum/db";
import { documents, projects } from "@spektrum/db/schema";
import { getObject } from "@spektrum/storage";
import { listProjects } from "@/lib/projects";
import { writeZip } from "@/lib/import/zip";

export type ExportManifest = {
  name: string;
  exportedAt: string;
  files: string[];
};

type ExportFile = { path: string; data: Uint8Array };

/** A path segment that is safe to use as a zip directory name. */
function safeSegment(name: string): string {
  const cleaned = name
    // backslash, forward slash and NUL can never appear in a segment
    .replace(/[\\/\x00]/g, "-")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 100);
  return cleaned === "" ? "project" : cleaned;
}

async function readDocuments(
  userId: string,
  projectId: string,
): Promise<{ projectName: string; docs: Array<{ path: string; data: Uint8Array }> } | null> {
  const rows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.ownerId, userId),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  const project = rows[0];
  if (!project) return null;

  const docs = await db
    .select({
      path: documents.path,
      content: documents.content,
      blobKey: documents.blobKey,
    })
    .from(documents)
    .where(eq(documents.projectId, projectId))
    .orderBy(asc(documents.path));

  const out: Array<{ path: string; data: Uint8Array }> = [];
  for (const doc of docs) {
    if (doc.content !== null) {
      out.push({ path: doc.path, data: new TextEncoder().encode(doc.content) });
      continue;
    }
    if (!doc.blobKey) continue;
    const object = await getObject("uploads", doc.blobKey);
    out.push({ path: doc.path, data: new Uint8Array(object.body) });
  }
  return { projectName: project.name, docs: out };
}

function manifestFor(name: string, files: string[]): ExportManifest {
  return { name, exportedAt: new Date().toISOString(), files };
}

export async function buildProjectExport(
  userId: string,
  projectId: string,
): Promise<{ fileName: string; bytes: Uint8Array } | null> {
  const found = await readDocuments(userId, projectId);
  if (!found) return null;

  const segment = safeSegment(found.projectName);
  const files: ExportFile[] = found.docs.map((doc) => ({
    path: `${segment}/${doc.path}`,
    data: doc.data,
  }));
  const manifest = manifestFor(
    found.projectName,
    found.docs.map((doc) => doc.path),
  );
  files.push({
    path: `${segment}/spektrum-export.json`,
    data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  });

  return {
    fileName: `${found.projectName.replace(/[\\/\x00]/g, "-")}.zip`,
    bytes: writeZip(files),
  };
}

export async function buildAllExport(
  userId: string,
): Promise<{ fileName: string; bytes: Uint8Array }> {
  const listed = await listProjects(userId);
  const files: ExportFile[] = [];

  for (const project of listed) {
    const found = await readDocuments(userId, project.id);
    if (!found) continue;
    const segment = safeSegment(found.projectName);
    for (const doc of found.docs) {
      files.push({ path: `${segment}/${doc.path}`, data: doc.data });
    }
    const manifest = manifestFor(
      found.projectName,
      found.docs.map((doc) => doc.path),
    );
    files.push({
      path: `${segment}/spektrum-export.json`,
      data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    });
  }

  return {
    fileName: `spektrum-projects-${new Date().toISOString().slice(0, 10)}.zip`,
    bytes: writeZip(files),
  };
}