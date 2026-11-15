// Compile worker entry (spec §3.1). Run with `pnpm --filter @spektrum/worker dev`.
import { Worker } from "bullmq";
import { connectRedis, handler, QUEUE_NAME } from "./queue";
import { recoverStaleLocks, recoverStaleRuns } from "./recover";
import { startHealthServer } from "./health";

const redis = connectRedis();
await recoverStaleRuns();
await recoverStaleLocks(redis);

const worker = new Worker(QUEUE_NAME, (job) => handler(job, redis), {
  connection: redis,
  concurrency: 2,
});

// A failed compile is otherwise invisible: the job is retried and finally
// dropped, and the only trace is the render row. Log the outcome so an operator
// can see why compiles are not landing.
worker.on("failed", (job, error) => {
  console.error(
    `compile failed: job=${job?.id} attempts=${job?.attemptsMade} ${error.message}`,
  );
});
worker.on("completed", (job) => {
  console.log(`compile done: job=${job?.id}`);
});

let stopping = false;
const stop = async (signal: string): Promise<void> => {
  if (stopping) return;
  stopping = true;
  console.log(`worker: ${signal}, closing`);
  await worker.close();
  redis.disconnect();
  process.exit(0);
};
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));

console.log("worker: ready");

const healthPort = Number(process.env.HEALTH_PORT ?? 3001);
if (Number.isFinite(healthPort)) {
  startHealthServer(healthPort);
  console.log(`worker: health on :${healthPort}`);
}