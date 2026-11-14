// Task 8 replaces this stub with the real compile job.
import type { CompileJob } from "@spektrum/shared/compile";

export async function runCompile(
  _job: CompileJob,
): Promise<{ status: "ok" | "error"; durationMs: number }> {
  throw new Error("runCompile is implemented in Task 8");
}