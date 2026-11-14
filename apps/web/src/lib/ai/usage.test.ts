import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { llmUsage, users } from "@spektrum/db/schema";
import { recordUsage } from "./usage";

const run = Math.random().toString(36).slice(2, 10);
const userId = `usage-${run}`;

beforeAll(async () => {
  await db.insert(users).values({
    id: userId,
    email: `usage-${run}@test.local`,
    name: "U",
  });
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await pool.end();
});

describe("recordUsage", () => {
  it("inserts a row with the request id and a null cost estimate", async () => {
    await recordUsage({
      userId,
      model: "openai/gpt-4o",
      inputTokens: 3,
      outputTokens: 4,
      requestId: "req-1",
    });
    const rows = await db
      .select()
      .from(llmUsage)
      .where(eq(llmUsage.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      model: "openai/gpt-4o",
      inputTokens: 3,
      outputTokens: 4,
      requestId: "req-1",
      costEstimate: null,
    });
  });

  it("defaults missing token counts to zero", async () => {
    await recordUsage({ userId, model: "openai/gpt-4o-mini" });
    const rows = await db
      .select()
      .from(llmUsage)
      .where(eq(llmUsage.userId, userId));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });
});