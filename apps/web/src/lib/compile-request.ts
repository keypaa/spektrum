import { and, eq } from "drizzle-orm";
import { db } from "@spektrum/db";
import { pdfRenders } from "@spektrum/db/schema";
import { currentRevisionKey } from "@spektrum/shared/compile";
import { BUDGETS, consume, getRedis } from "@spektrum/shared/rate-limit";
import { revisionHash } from "@spektrum/shared/revision";
import {
  getDocumentByPath,
  listRevisionDocuments,
} from "./documents";
import { getProject } from "./projects";

export type CompileRequestResult =
  | { kind: "enqueued"; revision: string }
  | { kind: "cached"; revision: string }
  | { kind: "rate_limited"; retryAfterMs: number }
  | { kind: "not_found" };

/**
 * The compile enqueue policy, extracted from the route so the AI `compile`
 * tool shares the same cached/hourly/per-minute budget and Redis key.
 */
export async function enqueueProjectCompile(
  user: { id: string },
  projectId: string,
  mainFile: string,
  options: { force?: boolean } = {},
): Promise<CompileRequestResult> {
  const project = await getProject(user.id, projectId);
  if (!project) return { kind: "not_found" };

  const main = await getDocumentByPath(user.id, projectId, mainFile);
  if (!main) return { kind: "not_found" };

  const revision = revisionHash(await listRevisionDocuments(projectId));

  const [cached] = await db
    .select({ id: pdfRenders.id })
    .from(pdfRenders)
    .where(
      and(
        eq(pdfRenders.projectId, projectId),
        eq(pdfRenders.revisionHash, revision),
        eq(pdfRenders.status, "ok"),
      ),
    );
  if (cached && !options.force) return { kind: "cached", revision };

  const hourly = await consume(`compileHourly:${user.id}`, BUDGETS.compileHourly);
  if (!hourly.allowed) {
    return { kind: "rate_limited", retryAfterMs: hourly.retryAfterMs };
  }
  const limit = await consume(`compile:${user.id}`, BUDGETS.compile);
  if (!limit.allowed) {
    return { kind: "rate_limited", retryAfterMs: limit.retryAfterMs };
  }

  await getRedis().set(currentRevisionKey(projectId), revision);
  // Compilation now happens in the browser against the WASM engine; there is
  // no BullMQ job to enqueue. The revision marker above still lets the client
  // detect that this compile was accepted for the current document state.
  return { kind: "enqueued", revision };
}