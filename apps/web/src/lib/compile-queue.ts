// The web-side BullMQ queue. The worker owns the connection options; the web
// only enqueues. Job options live here so `attempts`/`backoff` are not
// mistaken for WorkerOptions (bullmq 6).
import { Queue } from "bullmq";
import { QUEUE_NAME, type CompileJob } from "@spektrum/shared/compile";

const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");

export const compileQueue = new Queue(QUEUE_NAME, {
  connection: { host: url.hostname, port: Number(url.port || 6379) },
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "fixed", delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

export async function enqueueCompile(job: CompileJob): Promise<void> {
  await compileQueue.add("compile", job, {
    jobId: `${job.projectId}-${job.revisionHash}`,
  });
}