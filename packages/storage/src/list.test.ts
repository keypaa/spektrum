// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteObject, listObjects, putObject } from "./index";

const IT = process.env.STORAGE_IT === "1";
const key = `test/${crypto.randomUUID()}/nested.txt`;

describe.skipIf(!IT)("listObjects", () => {
  beforeAll(async () => {
    if (!IT) return;
    await putObject("uploads", key, "hello", "text/plain");
  });

  afterAll(async () => {
    if (!IT) return;
    await deleteObject("uploads", key).catch(() => undefined);
  });

  it("lists every key in the bucket, including nested ones", async () => {
    const keys = (await listObjects("uploads")).map((o) => o.key);
    expect(keys).toContain(key);
  });
});