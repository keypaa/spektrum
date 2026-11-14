// Server-side render reads (spec §11.2, §11.4). Ownership is part of the query:
// every read joins `projects` on id + owner_id + not deleted.

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@spektrum/db";
import { pdfRenders, projects } from "@spektrum/db/schema";
import { listRevisionDocuments } from "@spektrum/db/documents";
import { revisionHash } from "@spektrum/shared/revision";
import type { Diagnostic, ProjectStats } from "@spektrum/shared/compile";

function ownedProject(userId: string, projectId: string) {
  return and(
    eq(projects.id, projectId),
    eq(projects.ownerId, userId),
    isNull(projects.deletedAt),
  );
}

export async function getRender(
  userId: string,
  projectId: string,
  revision: string,
): Promise<{ pdfKey: string; synctexKey: string | null } | null> {
  const [row] = await db
    .select({
      pdfKey: pdfRenders.pdfKey,
      synctexKey: pdfRenders.synctexKey,
    })
    .from(pdfRenders)
    .innerJoin(
      projects,
      and(eq(projects.id, pdfRenders.projectId), ownedProject(userId, projectId)),
    )
    .where(
      and(
        eq(pdfRenders.projectId, projectId),
        eq(pdfRenders.revisionHash, revision),
        eq(pdfRenders.status, "ok"),
      ),
    );
  return row?.pdfKey ? { pdfKey: row.pdfKey, synctexKey: row.synctexKey } : null;
}

export interface LatestRender {
  revision: string;
  status: string;
  mainFile: string | null;
  stats: ProjectStats | null;
  diagnostics: Diagnostic[];
  durationMs: number;
  createdAt: Date;
  pdfUrl: string | null;
  lastOkRevision: string | null;
  isCurrent: boolean;
}

export async function getLatestRender(
  userId: string,
  projectId: string,
): Promise<{ render: LatestRender; revisionHash: string } | null> {
  const rows = await db
    .select({
      revisionHash: pdfRenders.revisionHash,
      status: pdfRenders.status,
      mainFile: pdfRenders.mainFile,
      stats: pdfRenders.stats,
      diagnostics: pdfRenders.diagnostics,
      durationMs: pdfRenders.durationMs,
      createdAt: pdfRenders.createdAt,
    })
    .from(pdfRenders)
    .innerJoin(
      projects,
      and(eq(projects.id, pdfRenders.projectId), ownedProject(userId, projectId)),
    )
    .where(eq(pdfRenders.projectId, projectId))
    .orderBy(desc(pdfRenders.createdAt), desc(pdfRenders.id))
    .limit(100);

  if (rows.length === 0) return null;
  const latest = rows[0]!;
  const lastOk = rows.find((row) => row.status === "ok");
  const hash = revisionHash(await listRevisionDocuments(projectId));

  return {
    render: {
      revision: latest.revisionHash,
      status: latest.status,
      mainFile: latest.mainFile,
      stats: latest.stats ?? null,
      diagnostics: latest.diagnostics ?? [],
      durationMs: latest.durationMs ?? 0,
      createdAt: latest.createdAt,
      pdfUrl: lastOk
        ? `/api/projects/${projectId}/render/${lastOk.revisionHash}/pdf`
        : null,
      lastOkRevision: lastOk?.revisionHash ?? null,
      isCurrent: latest.revisionHash === hash,
    },
    revisionHash: hash,
  };
}

export async function getRenderLog(
  userId: string,
  projectId: string,
  revision: string,
): Promise<string | null> {
  const [row] = await db
    .select({ log: pdfRenders.log })
    .from(pdfRenders)
    .innerJoin(
      projects,
      and(eq(projects.id, pdfRenders.projectId), ownedProject(userId, projectId)),
    )
    .where(
      and(
        eq(pdfRenders.projectId, projectId),
        eq(pdfRenders.revisionHash, revision),
      ),
    );
  return row?.log ?? null;
}