// Compile-pipeline diagnostics (spec §19 operations).
//
//   pnpm exec tsx scripts/compile-diagnostics.ts [baseUrl]
//
// Answers "why is nothing compiling?" without a debugger: how many jobs are
// waiting/active/failed in Redis, and what the newest renders look like in
// Postgres. Used by the CI compile job and by operators.
import { Redis } from "ioredis";
import { Queue } from "bullmq";
import { QUEUE_NAME } from "@spektrum/shared/compile";
import { desc, sql } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { pdfRenders } from "@spektrum/db/schema";

const main = async (): Promise<void> => {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";

  const redis = new Redis(url, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE_NAME, {
    connection: new Redis(url, { maxRetriesPerRequest: null }),
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
      (render.log ?? "").split("\n").slice(-4).join(" | ").slice(0, 300),
    );
  }

  await queue.close();
  await redis.quit();
  await pool.end();
};

main().catch((e: unknown) => {
  console.error("compile diagnostics failed:", e);
  process.exitCode = 1;
});