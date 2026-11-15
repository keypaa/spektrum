// Compile-pipeline diagnostics (spec §19 operations).
//
//   pnpm exec tsx scripts/compile-diagnostics.ts
//
// Answers "why is nothing compiling?" without a debugger: how many jobs are
// waiting/active/failed in Redis, and what the newest renders look like in
// Postgres. Used by the CI compile job and by operators.
//
// Every stage prints before it runs, and a watchdog force-exits after 45 s: a
// diagnostics helper must never be the thing that hangs a job.
import { Redis } from "ioredis";
import { Queue } from "bullmq";
import { QUEUE_NAME } from "@spektrum/shared/compile";
import { desc, sql } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { pdfRenders } from "@spektrum/db/schema";

const WATCHDOG_MS = 45_000;

const main = async (): Promise<void> => {
  const watchdog = setTimeout(() => {
    console.error(`compile diagnostics timed out after ${WATCHDOG_MS / 1000}s`);
    process.exit(2);
  }, WATCHDOG_MS);

  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  console.log(`connecting to redis ${url}`);

  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    retryStrategy: () => null,
  });
  const queue = new Queue(QUEUE_NAME, {
    connection: new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      retryStrategy: () => null,
    }),
  });

  const counts = await queue.getJobCounts(
    "wait",
    "active",
    "delayed",
    "failed",
    "completed",
  );
  console.log("queue:", QUEUE_NAME, counts);

  const keys = await redis.keys("bull:*");
  console.log("redis keys:", keys.length > 20 ? `${keys.length} (truncated)` : keys);

  console.log("querying renders");
  const byStatus = await db
    .select({ status: pdfRenders.status, count: sql<number>`count(*)::int` })
    .from(pdfRenders)
    .groupBy(pdfRenders.status);
  console.log("renders:", byStatus);

  const latest = await db
    .select({
      id: pdfRenders.id,
      status: pdfRenders.status,
      createdAt: pdfRenders.createdAt,
      log: pdfRenders.log,
    })
    .from(pdfRenders)
    .orderBy(desc(pdfRenders.createdAt))
    .limit(3);
  for (const render of latest) {
    console.log(
      `render ${render.id} ${render.status} ${render.createdAt.toISOString()}:`,
      (render.log ?? "")
        .split("\n")
        .slice(-4)
        .join(" | ")
        .slice(0, 300),
    );
  }

  clearTimeout(watchdog);
  await queue.close();
  await redis.quit();
  await pool.end();
  console.log("compile diagnostics done");
};

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error("compile diagnostics failed:", e);
    process.exit(1);
  });