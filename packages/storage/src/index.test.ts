import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

const PRESIGN_ENDPOINT = "https://acct.r2.cloudflarestorage.com";

describe("presigning (R2)", () => {
  let storage: typeof import("./index");

  beforeAll(async () => {
    // The storage client captures its endpoint at import time, so point a fresh
    // module instance at an https R2 endpoint before importing it.
    vi.stubEnv("S3_ENDPOINT", PRESIGN_ENDPOINT);
    vi.stubEnv("S3_REGION", "auto");
    vi.stubEnv("S3_BUCKET", "spektrum-uploads");
    vi.stubEnv("S3_PDF_BUCKET", "spektrum-pdf");
    vi.resetModules();
    storage = await import("./index");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("presigns an upload with the bucket, encoded key and a short expiry", async () => {
    const key = `u/u1/import/${crypto.randomUUID()}.zip`;
    const signed = await storage.presignUpload({
      bucket: "uploads",
      key,
      contentType: "application/zip",
      maxBytes: 1024,
    });
    const url = new URL(signed.url);
    expect(url.origin + url.pathname).toBe(
      `${PRESIGN_ENDPOINT}/spektrum-uploads/${key}`,
    );
    expect(decodeURIComponent(url.pathname)).toContain(key);
    expect(Number(url.searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(
      900,
    );
    expect(signed.headers["Content-Type"]).toBe("application/zip");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("content-type");
    expect(signed.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("caps a requested expiry at 900 seconds", async () => {
    const signed = await storage.presignUpload({
      bucket: "uploads",
      key: `u/u1/render/${crypto.randomUUID()}.pdf`,
      contentType: "application/pdf",
      maxBytes: 1024,
      expiresInSeconds: 3600,
    });
    expect(
      Number(new URL(signed.url).searchParams.get("X-Amz-Expires")),
    ).toBeLessThanOrEqual(900);
  });

  it("presigns a download as an https URL", async () => {
    const url = await storage.presignDownload(
      "pdf",
      `u/u1/render/${crypto.randomUUID()}.pdf`,
    );
    expect(url.startsWith("https:")).toBe(true);
    expect(Number(new URL(url).searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(
      900,
    );
  });
});