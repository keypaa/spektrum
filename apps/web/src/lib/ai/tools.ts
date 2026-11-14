import { and, desc, eq, ilike, isNotNull, ne, isNull } from "drizzle-orm";
import { db } from "@spektrum/db";
import { listContextDocuments, listRevisionDocuments } from "@spektrum/db/documents";
import { documents, pdfRenders, projects } from "@spektrum/db/schema";
import type { DiffProposal } from "@spektrum/shared/ai/diff";
import type { ToolName } from "@spektrum/shared/ai";
import { toolArgs } from "@spektrum/shared/ai/tools";
import type { Diagnostic } from "@spektrum/shared/compile";
import { revisionHash } from "@spektrum/shared/revision";
import {
  getDocumentByPath,
  kindForPath,
  listTree,
  normalizeDocumentPath,
} from "@/lib/documents";
import { getProject } from "@/lib/projects";
import { enqueueProjectCompile } from "@/lib/compile-request";
import {
  DiffError,
  proposeCreate,
  proposeDelete,
  proposeEdit,
  proposeWrite,
} from "./diff";

export type ToolResult =
  | { ok: true; summary: string; proposal?: DiffProposal; data?: unknown }
  | { ok: false; summary: string; fatal: boolean };

type ToolContext = {
  userId: string;
  role: string;
  projectId: string;
  mainFile: string;
  touchedPaths: Set<string>;
};

const MAX_READ = 20_000;
const MAX_SEARCH = 50;

function safePath(path: string): string | null {
  try {
    return normalizeDocumentPath(path);
  } catch {
    return null;
  }
}

function notFound(summary = "not found"): ToolResult {
  return { ok: false, summary, fatal: false };
}

function binary(): ToolResult {
  return { ok: false, summary: "binary document", fatal: false };
}

async function latestRender(projectId: string, revision: string) {
  const [row] = await db
    .select({
      status: pdfRenders.status,
      durationMs: pdfRenders.durationMs,
      log: pdfRenders.log,
      diagnostics: pdfRenders.diagnostics,
    })
    .from(pdfRenders)
    .where(
      and(
        eq(pdfRenders.projectId, projectId),
        eq(pdfRenders.revisionHash, revision),
      ),
    )
    .orderBy(desc(pdfRenders.createdAt), desc(pdfRenders.id))
    .limit(1);
  return row ?? null;
}

export async function compileAndWait(
  projectId: string,
  revision: string,
  pre?: { status: string; durationMs: number | null; log: string | null },
  options?: { timeoutMs?: number; intervalMs?: number; graceMs?: number },
): Promise<{
  status: "ok" | "error" | "superseded" | "timeout";
  diagnostics: Diagnostic[];
}> {
  const timeoutMs = options?.timeoutMs ?? 35_000;
  const intervalMs = options?.intervalMs ?? 250;
  const graceMs = options?.graceMs ?? 1_000;
  const started = Date.now();
  let sawTransition = false;

  while (Date.now() - started < timeoutMs) {
    const row = await latestRender(projectId, revision);
    if (row) {
      if (row.status === "queued" || row.status === "running") {
        sawTransition = true;
      } else if (
        row.status === "ok" ||
        row.status === "error" ||
        row.status === "superseded"
      ) {
        const changed =
          !pre ||
          row.status !== pre.status ||
          row.durationMs !== pre.durationMs ||
          row.log !== pre.log;
        if (changed || sawTransition || Date.now() - started >= graceMs) {
          return {
            status: row.status,
            diagnostics: row.diagnostics ?? [],
          };
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { status: "timeout", diagnostics: [] };
}

export async function executeTool(
  name: ToolName,
  args: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const schema = toolArgs[name as keyof typeof toolArgs];
  if (!schema) {
    return { ok: false, summary: `unknown tool ${name}`, fatal: true };
  }
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, summary: "invalid arguments", fatal: true };
  }
  const data = parsed.data as Record<string, unknown>;

  const project = await getProject(ctx.userId, ctx.projectId);
  if (!project) return notFound();

  switch (name) {
    case "list_files": {
      const tree = await listTree(ctx.userId, ctx.projectId);
      const docs = await listContextDocuments(
        ctx.projectId,
        ctx.userId,
        tree.map((doc) => doc.path),
      );
      return {
        ok: true,
        summary: `${tree.length} files`,
        data: {
          files: docs.map((doc) => ({
            path: doc.path,
            kind: doc.kind,
            bytes:
              doc.content === null
                ? null
                : new TextEncoder().encode(doc.content).length,
          })),
        },
      };
    }

    case "read_file": {
      const path = safePath(String(data.path));
      if (!path) return { ok: false, summary: "invalid path", fatal: false };
      const doc = await getDocumentByPath(ctx.userId, ctx.projectId, path);
      if (!doc) return notFound();
      if (doc.kind === "img" || doc.content === null) return binary();
      let text = doc.content;
      const startLine = data.startLine as number | undefined;
      const endLine = data.endLine as number | undefined;
      if (startLine !== undefined || endLine !== undefined) {
        text = text
          .split("\n")
          .slice((startLine ?? 1) - 1, endLine ?? undefined)
          .join("\n");
      }
      if (text.length > MAX_READ) {
        text = `${text.slice(0, MAX_READ)}\n[truncated]`;
      }
      ctx.touchedPaths.add(doc.path);
      return { ok: true, summary: `read ${doc.path}`, data: text };
    }

    case "search_project": {
      const query = String(data.query);
      const pattern = query.replace(/[\\%_]/g, "\\$&");
      const rows = await db
        .select({ path: documents.path, content: documents.content })
        .from(documents)
        .innerJoin(
          projects,
          and(
            eq(documents.projectId, projects.id),
            eq(projects.ownerId, ctx.userId),
            isNull(projects.deletedAt),
          ),
        )
        .where(
          and(
            eq(documents.projectId, ctx.projectId),
            isNotNull(documents.content),
            ne(documents.kind, "img"),
            ilike(documents.content, `%${pattern}%`),
          ),
        )
        .limit(MAX_SEARCH);
      const needle = query.toLowerCase();
      const hits = rows.flatMap((row) =>
        (row.content ?? "")
          .split("\n")
          .flatMap((text, index) =>
            text.toLowerCase().includes(needle)
              ? [{ path: row.path, line: index + 1, text }]
              : [],
          ),
      );
      return {
        ok: true,
        summary: `${hits.length} matches`,
        data: hits.slice(0, MAX_SEARCH),
      };
    }

    case "get_logs": {
      const [row] = await db
        .select({ diagnostics: pdfRenders.diagnostics })
        .from(pdfRenders)
        .where(
          and(
            eq(pdfRenders.projectId, ctx.projectId),
            ne(pdfRenders.status, "queued"),
          ),
        )
        .orderBy(desc(pdfRenders.createdAt), desc(pdfRenders.id))
        .limit(1);
      const diagnostics = ((row?.diagnostics ?? []) as Diagnostic[]).slice(-10);
      return {
        ok: true,
        summary: `${diagnostics.length} diagnostics`,
        data: diagnostics,
      };
    }

    case "compile": {
      const revision = revisionHash(await listRevisionDocuments(ctx.projectId));
      const pre = await latestRender(ctx.projectId, revision);
      const enqueued = await enqueueProjectCompile(
        { id: ctx.userId },
        ctx.projectId,
        ctx.mainFile,
      );
      if (enqueued.kind === "rate_limited") {
        return { ok: false, summary: "compile rate limited", fatal: false };
      }
      if (enqueued.kind === "not_found") {
        return { ok: false, summary: "main file not found", fatal: false };
      }
      const result = await compileAndWait(
        ctx.projectId,
        enqueued.revision,
        pre
          ? {
              status: pre.status,
              durationMs: pre.durationMs,
              log: pre.log,
            }
          : undefined,
      );
      if (result.status === "timeout") {
        return { ok: false, summary: "compile timed out", fatal: false };
      }
      return {
        ok: true,
        summary: `compile ${result.status}`,
        data: { status: result.status, diagnostics: result.diagnostics },
      };
    }

    case "write_file": {
      const path = safePath(String(data.path));
      if (!path) return { ok: false, summary: "invalid path", fatal: false };
      const doc = await getDocumentByPath(ctx.userId, ctx.projectId, path);
      if (!doc) return notFound();
      if (doc.kind === "img" || doc.content === null) return binary();
      const proposal = await proposeWrite({
        path: doc.path,
        original: doc.content,
        content: String(data.content),
        reason: String(data.reason),
        kind: doc.kind,
      });
      ctx.touchedPaths.add(doc.path);
      return { ok: true, summary: `proposed write ${doc.path}`, proposal };
    }

    case "edit_file": {
      const path = safePath(String(data.path));
      if (!path) return { ok: false, summary: "invalid path", fatal: false };
      const doc = await getDocumentByPath(ctx.userId, ctx.projectId, path);
      if (!doc) return notFound();
      if (doc.kind === "img" || doc.content === null) return binary();
      try {
        const proposal = await proposeEdit({
          path: doc.path,
          original: doc.content,
          oldText: String(data.oldText),
          newText: String(data.newText),
          reason: String(data.reason),
          kind: doc.kind,
        });
        ctx.touchedPaths.add(doc.path);
        return { ok: true, summary: `proposed edit ${doc.path}`, proposal };
      } catch (error) {
        if (error instanceof DiffError) {
          return { ok: false, summary: error.message, fatal: false };
        }
        throw error;
      }
    }

    case "create_file": {
      const path = safePath(String(data.path));
      if (!path) return { ok: false, summary: "invalid path", fatal: false };
      const existing = await getDocumentByPath(
        ctx.userId,
        ctx.projectId,
        path,
      );
      if (existing) {
        return { ok: false, summary: "a file already exists at that path", fatal: false };
      }
      const proposal = await proposeCreate({
        path,
        content: String(data.content),
        reason: "create file",
        kind: kindForPath(path),
      });
      return { ok: true, summary: `proposed create ${path}`, proposal };
    }

    case "delete_file": {
      const path = safePath(String(data.path));
      if (!path) return { ok: false, summary: "invalid path", fatal: false };
      const doc = await getDocumentByPath(ctx.userId, ctx.projectId, path);
      if (!doc) return notFound();
      if (doc.kind === "img" || doc.content === null) return binary();
      const proposal = await proposeDelete({
        path: doc.path,
        original: doc.content,
        reason: "delete file",
        kind: doc.kind,
      });
      return { ok: true, summary: `proposed delete ${doc.path}`, proposal };
    }

    default:
      return { ok: false, summary: `unknown tool ${name}`, fatal: true };
  }
}