// The compile queue's worker-side helpers: the Redis connection, the per-project
// lock, and the supersede check (spec §11.2, D50). BullMQ needs a connection
// with `maxRetriesPerRequest: null`; the app's `getRedis()` uses 2 and cannot
// be reused.

import { Redis } from "ioredis";
import {
  compileJobSchema,
  currentRevisionKey,
  QUEUE_NAME,
  renderChannel,
  type CompileJob,
} from "@spektrum/shared/compile";
import { runCompile } from "./compile";

export { QUEUE_NAME, renderChannel, currentRevisionKey };

export const LOCK_PREFIX = "compile-lock:";
const LOCK_TTL_MS = 5 * 60_000;
const LOCK_WAIT_MS = 30_000;

export function connectRedis(): Redis {
  return new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}

/** True when a newer revision is known for the project. */
export function supersededBy(
  current: string | null,
  revision: string,
): boolean {
  return current !== null && current !== revision;
}

export interface LockRedis {
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
}

async function acquireLock(redis: LockRedis, projectId: string): Promise<boolean> {
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    const ok = await redis.set(
      `${LOCK_PREFIX}${projectId}`,
      String(Date.now()),
      "PX",
      LOCK_TTL_MS,
      "NX",
    );
    if (ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

export async function handlerWith(
  job: { data: CompileJob },
  redis: LockRedis,
): Promise<{ skipped?: string }> {
  const parsed = compileJobSchema.safeParse(job.data);
  if (!parsed.success) throw new Error("invalid compile job");
  const data = parsed.data;

  const current = await redis.get(currentRevisionKey(data.projectId));
  if (supersededBy(current, data.revisionHash)) return { skipped: "superseded" };

  if (!(await acquireLock(redis, data.projectId))) throw new Error("locked");
  try {
    await runCompile(data);
    return {};
  } finally {
    await redis.del(`${LOCK_PREFIX}${data.projectId}`);
  }
}

/** BullMQ processor entry (one parameter: BullMQ passes a sandbox token second). */
export async function handler(
  job: { data: CompileJob },
  redis: LockRedis = connectRedis(),
): Promise<{ skipped?: string }> {
  // BullMQ owns the connection passed to the Worker; never disconnect it here.
  return handlerWith(job, redis);
}