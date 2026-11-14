import { db } from "@spektrum/db";
import { llmUsage } from "@spektrum/db/schema";

/** One metered gateway call. `costEstimate` stays null until pricing exists. */
export async function recordUsage(input: {
  userId: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  requestId?: string;
}): Promise<void> {
  await db.insert(llmUsage).values({
    userId: input.userId,
    model: input.model,
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    costEstimate: null,
    requestId: input.requestId ?? null,
  });
}