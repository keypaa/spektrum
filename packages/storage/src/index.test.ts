import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import {
  assertNoAnonymousRead,
  deleteObject,
  getObject,
  getObjectRange,
  putObject,
  StorageError,
} from "./index";

const IT = process.env.STORAGE_IT === "1";
const key = `test/${crypto.randomUUID()}.txt`;

describe.skipIf(!IT)("storage (MinIO/S3)", () => {
  beforeAll(async () => {
    if (!IT) return;
    const client = new S3Client({
      endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: "x", secretAccessKey: "x" },
    });
    for (const bucket of ["spektrum-pdf", "spektrum-uploads"]) {
      await client
        .send(new CreateBucketCommand({ Bucket: bucket }))
        .catch(() => undefined);
    }
  });

  afterAll(async () => {
    if (!IT) return;
    await deleteObject("pdf", key).catch(() => undefined);
  });

  it("puts, reads and range-reads an object", async () => {
    await putObject("pdf", key, "hello world", "text/plain");

    const whole = await getObject("pdf", key);
    expect(whole.body.toString("utf8")).toBe("hello world");
    expect(whole.size).toBe(11);

    const range = await getObjectRange("pdf", key, 0, 4);
    const bytes = new Uint8Array(await new Response(range.body).arrayBuffer());
    expect(new TextDecoder().decode(bytes)).toBe("hello");
    expect(range.size).toBe(11); // full length, not the range length
  });

  it("throws StorageError for a missing key", async () => {
    await expect(getObject("pdf", "test/does-not-exist.txt")).rejects.toBeInstanceOf(
      StorageError,
    );
  });

  it("has no anonymous-read policy", async () => {
    await assertNoAnonymousRead("pdf");
  });
});