// Prism importer — the DB writer behind `POST /api/import` (spec §13.2).
//
// `parsePrismArchive` is pure; this file does the persistence:
//   - one `projects` row per archive project,
//   - one `documents` row per file (inline text <= 512 KiB, otherwise the
//     `uploads` bucket + `blob_key`),
//   - one `chat_threads` row per exported conversation and one `chat_messages`
//     row per turn,
//   - one `import_batches` row per project, which makes re-importing the same
//     archive a no-op (idempotency is `(user, project, archive hash)`).
import { and, eq } from "drizzle-orm";
import { db } from "@spektrum/db";
import {
  chatMessages,
  chatThreads,
  documents,
  importBatches,
  projects,
} from "@spektrum/db/schema";
import { sha256HexBytes } from "@spektrum/shared/hash";
import { putObject } from "@spektrum/storage";
import { parsePrismArchive, type ParsedFile } from "./prism";
import { readZip, ZIP_LIMITS } from "./zip";

/** The document inline-content cap, in bytes (spec §4). */
export const MAX_INLINE_BYTES = 524_288;

export type ImportReport = {
  projects: number;
  files: number;
  rewrittenPaths: number;
  promotedMains: number;
  conversationsImported: number;
  conversationsSkipped: number;
  rejectedPaths: string[];
  skipped: Array<{ project: string; reason: "duplicate" }>;
};

export type ImportLimits = {
  maxFileBytes?: number;
  maxTotalBytes?: number;
  maxEntries?: number;
  maxProjects?: number;
};

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  tex: "application/x-tex",
  bib: "application/x-bibtex",
  csv: "text/csv",
};

function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot <= 0) return "application/octet-stream";
  return MIME_BY_EXT[path.slice(dot + 1).toLowerCase()] ?? "application/octet-stream";
}

export async function importArchive(
  userId: string,
  archiveBytes: Uint8Array,
  limits: ImportLimits = {},
): Promise<ImportReport> {
  const maxFileBytes = limits.maxFileBytes ?? ZIP_LIMITS.maxFileBytes;
  const archiveHash = await sha256HexBytes(archiveBytes);

  const report: ImportReport = {
    projects: 0,
    files: 0,
    rewrittenPaths: 0,
    promotedMains: 0,
    conversationsImported: 0,
    conversationsSkipped: 0,
    rejectedPaths: [],
    skipped: [],
  };

  const parsed = parsePrismArchive(
    readZip(archiveBytes, {
      maxFileBytes,
      maxTotalBytes: limits.maxTotalBytes ?? ZIP_LIMITS.maxTotalBytes,
      maxEntries: limits.maxEntries ?? ZIP_LIMITS.maxEntries,
      maxRatio: ZIP_LIMITS.maxRatio,
    }),
    {
      maxFileBytes,
      maxProjects: limits.maxProjects ?? 200,
    },
  );
  report.rejectedPaths = parsed.rejectedPaths;

  for (const project of parsed.projects) {
    const [already] = await db
      .select({ id: importBatches.id })
      .from(importBatches)
      .where(
        and(
          eq(importBatches.userId, userId),
          eq(importBatches.projectName, project.name),
          eq(importBatches.archiveHash, archiveHash),
        ),
      )
      .limit(1);
    if (already) {
      report.skipped.push({ project: project.name, reason: "duplicate" });
      continue;
    }

    await db.transaction(async (tx) => {
      const [projectRow] = await tx
        .insert(projects)
        .values({ ownerId: userId, name: project.name })
        .returning({ id: projects.id });
      if (!projectRow) throw new Error("failed to insert project");
      const projectId = projectRow.id;

      let mainDocumentId: string | null = null;
      for (const file of project.files) {
        const documentId = await insertDocument(tx, projectId, file);
        if (file.path === project.mainPath) mainDocumentId = documentId;
        report.files += 1;
      }
      if (mainDocumentId) {
        await tx
          .update(projects)
          .set({ mainDocumentId })
          .where(eq(projects.id, projectId));
      }

      for (const conversation of project.conversations) {
        if (conversation.skipped) {
          report.conversationsSkipped += 1;
          continue;
        }
        await insertConversation(tx, projectId, userId, conversation);
        report.conversationsImported += 1;
      }

      await tx.insert(importBatches).values({
        userId,
        projectName: project.name,
        archiveHash,
        report: {
          files: project.files.length,
          rewrites: project.rewrites.length,
          promotedMain: project.promotedMain,
          conversations: project.conversations.length,
        },
      });
    });

    report.projects += 1;
    report.rewrittenPaths += project.rewrites.length;
    if (project.promotedMain) report.promotedMains += 1;
  }

  return report;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertDocument(
  tx: Tx,
  projectId: string,
  file: ParsedFile,
): Promise<string> {
  const inline = file.text !== null && file.bytes.byteLength <= MAX_INLINE_BYTES;
  let blobKey: string | null = null;
  if (!inline) {
    blobKey = `${projectId}/${file.path}`;
    await putObject("uploads", blobKey, file.bytes, contentTypeFor(file.path));
  }
  const [row] = await tx
    .insert(documents)
    .values({
      projectId,
      path: file.path,
      kind: file.kind,
      content: inline ? file.text : null,
      blobKey,
    })
    .returning({ id: documents.id });
  if (!row) throw new Error("failed to insert document");
  return row.id;
}

async function insertConversation(
  tx: Tx,
  projectId: string,
  userId: string,
  conversation: {
    id: string;
    title: string;
    turns: Array<{ role: "user" | "assistant" | "tool"; text: string }>;
  },
): Promise<void> {
  const [thread] = await tx
    .insert(chatThreads)
    .values({
      projectId,
      userId,
      title: conversation.title || conversation.id,
      titleSource: "fallback",
    })
    .returning({ id: chatThreads.id });
  if (!thread) throw new Error("failed to insert chat thread");

  for (const turn of conversation.turns) {
    await tx.insert(chatMessages).values({
      threadId: thread.id,
      role: turn.role,
      content:
        turn.role === "tool"
          ? {
              parts: [
                {
                  type: "tool_result",
                  id: crypto.randomUUID(),
                  ok: true,
                  summary: turn.text,
                },
              ],
            }
          : { parts: [{ type: "text", text: turn.text }] },
    });
  }
}