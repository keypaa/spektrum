// Compile worker entry (spec §3.1). Run with `pnpm --filter @spektrum/worker dev`.
import { Worker } from "bullmq";
import { connectRedis, handler, QUEUE_NAME } from "./queue";
import { recoverStaleLocks, recoverStaleRuns } from "./recover";

const redis = connectRedis();
await recoverStaleRuns();
await recoverStaleLocks(redis);

const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
const worker = new Worker(QUEUE_NAME, handler, {
  connection: { host: url.hostname, port: Number(url.port || 6379) },
  concurrency: 2,
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