// Prism export builder (spec §13.3).
//
// The archive is a re-importable Prism project: every document at its project
// path plus a `spektrum-export.json` manifest. Directory segments are
// sanitised so a hostile project name (`../x`) cannot produce an entry that a
// later import would treat as traversal — the manifest keeps the real name.
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@spektrum/db";
import { documents, projects } from "@spektrum/db/schema";
import { getDocumentObject } from "@/lib/document-blob";
import { listProjects } from "@/lib/projects";
import { writeZip } from "@/lib/import/zip";

export type ExportManifest = {
  name: string;
  exportedAt: string;
  files: string[];
};

/**
 * Ceiling for one export, in bytes of document content.
 *
 * `writeZip` builds the whole archive in memory, so peak RSS is roughly twice
 * the uncompressed content (the source strings plus the zip). Node's default
 * heap is ~2 GB on a 64-bit host and ~1 GiB inside a 2 GiB container; the
 * reference container is smaller than that, so the cap is set where a 512 MB
 * container (the smallest common serverless tier) stays comfortable.
 */
export const MAX_EXPORT_BYTES = 256 * 1024 * 1024;

export class ExportTooLargeError extends Error {
  constructor(public readonly bytes: number) {
    super("export_too_large");
    this.name = "ExportTooLargeError";
  }
}

export type ExportLimits = { maxBytes?: number };

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

/**
 * Unique directory segments for a set of project names.
 *
 * Two names can sanitise to the same segment (`a/b` and `a-b` both become
 * `a-b`), and because a zip is keyed by path the later project would overwrite
 * the earlier one — silent data loss in an "export everything" backup.
 */
export function uniqueSegments(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((name) => {
    const base = safeSegment(name);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  });
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
    const object = await getDocumentObject(doc.blobKey);
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
  limits: ExportLimits = {},
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
  assertWithinCap(files, limits);

  return {
    fileName: `${found.projectName.replace(/[\\/\x00]/g, "-")}.zip`,
    bytes: writeZip(files),
  };
}

export async function buildAllExport(
  userId: string,
  limits: ExportLimits = {},
): Promise<{ fileName: string; bytes: Uint8Array }> {
  const listed = await listProjects(userId);
  const files: ExportFile[] = [];
  // Project names are sanitised into directory segments, and two different
  // names can collapse onto one; a zip is keyed by path, so a collision would
  // silently drop one project's files from the "backup".
  const segments = uniqueSegments(listed.map((project) => project.name));

  for (const [index, project] of listed.entries()) {
    const found = await readDocuments(userId, project.id);
    if (!found) continue;
    const segment = segments[index] ?? safeSegment(found.projectName);
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
    // Checked per project, before the next one is read: the cap bounds peak
    // memory to itself plus one project.
    assertWithinCap(files, limits);
  }

  return {
    fileName: `spektrum-projects-${new Date().toISOString().slice(0, 10)}.zip`,
    bytes: writeZip(files),
  };
}

function totalBytes(files: ExportFile[]): number {
  return files.reduce((sum, file) => sum + file.data.byteLength, 0);
}

function assertWithinCap(files: ExportFile[], limits: ExportLimits): void {
  const max = limits.maxBytes ?? MAX_EXPORT_BYTES;
  const bytes = totalBytes(files);
  if (bytes > max) throw new ExportTooLargeError(bytes);
}
