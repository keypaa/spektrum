// S3-compatible storage for rendered PDFs and blobs (spec §3.1, §11.2).
// Server-only: do not import from client code.

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetBucketPolicyCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type Bucket = "pdf" | "uploads";

/** Short-lived URLs only: a signed PUT/GET is a bearer credential. */
const MAX_PRESIGN_EXPIRY = 900;

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

const endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
const region = process.env.S3_REGION ?? "auto";
const accessKeyId = process.env.S3_ACCESS_KEY ?? "spektrum";
const secretAccessKey = process.env.S3_SECRET_KEY ?? "spektrum-secret";

const client = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

function bucketName(bucket: Bucket): string {
  return bucket === "pdf"
    ? (process.env.S3_PDF_BUCKET ?? "spektrum-pdf")
    : (process.env.S3_BUCKET ?? "spektrum-uploads");
}

function isMissing(e: unknown): boolean {
  const name = (e as { name?: string }).name;
  return name === "NoSuchKey" || name === "NotFound";
}

function presignExpiry(expiresInSeconds?: number): number {
  if (expiresInSeconds === undefined) return MAX_PRESIGN_EXPIRY;
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new StorageError("invalid_presign_expiry");
  }
  // A long-lived presigned URL is a bearer credential; never mint one beyond
  // the platform's 15-minute ceiling, even if a caller asks for more.
  return Math.min(Math.floor(expiresInSeconds), MAX_PRESIGN_EXPIRY);
}

export interface PresignUploadInput {
  bucket: Bucket;
  key: string;
  contentType: string;
  /** Quota ceiling agreed with the caller, not a ContentLength to sign. */
  maxBytes: number;
  expiresInSeconds?: number;
}

/**
 * Mint a PUT URL for a direct-to-R2 upload. The browser sends the returned
 * headers verbatim; signing `content-type` stops it from swapping the type
 * after the URL has been issued.
 */
export async function presignUpload(
  input: PresignUploadInput,
): Promise<{ url: string; headers: Record<string, string>; expiresAt: Date }> {
  if (!Number.isInteger(input.maxBytes) || input.maxBytes <= 0) {
    throw new StorageError("invalid_max_bytes");
  }
  if (input.key.length === 0) throw new StorageError("invalid_key");
  const expiresIn = presignExpiry(input.expiresInSeconds);
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucketName(input.bucket),
      Key: input.key,
      ContentType: input.contentType,
    }),
    { expiresIn, signableHeaders: new Set(["content-type"]) },
  );
  return {
    url,
    headers: { "Content-Type": input.contentType },
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}

/** Mint a short-lived GET URL for an object the browser may read. */
export async function presignDownload(
  bucket: Bucket,
  key: string,
  expiresInSeconds?: number,
): Promise<string> {
  const expiresIn = presignExpiry(expiresInSeconds);
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucketName(bucket), Key: key }),
    { expiresIn },
  );
}

/** Create a bucket if it does not exist (dev/MinIO/SeaweedFS).
 *
 *  A bucket that already exists is success; anything else throws. This used to
 *  swallow every error, which meant a not-yet-ready object store looked like a
 *  successful run and the first real PUT failed later with a confusing 500. */

/** HTTP statuses worth another attempt. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send one command, retrying transient failures and naming the operation.
 *
 * A bare S3 `InternalError` does not say whether a read, a write or a bucket
 * call failed, and an object store that is still growing its first volume
 * answers 500 for a moment — the SDK's own retries happen within milliseconds,
 * so a short backoff here is what actually rides it out.
 */
async function send(
  command: unknown,
  operation: string,
  bucket: Bucket,
  key: string,
): Promise<void> {
  let last: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await client.send(command as never);
      return;
    } catch (e) {
      last = e;
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      const retryable =
        Boolean((e as { $retryable?: unknown }).$retryable) ||
        (status !== undefined && RETRYABLE_STATUS.has(status));
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
  console.error(
    `s3 ${operation} failed: ${bucket}/${key}: ${(last as Error).message}`,
  );
  throw last;
}

export async function ensureBucket(bucket: Bucket): Promise<void> {
  try {
    // Not through `send()`: "already owned" is the expected answer here, not a
    // failure worth retrying or logging.
    await client.send(
      new CreateBucketCommand({ Bucket: bucketName(bucket) }),
    );
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "BucketAlreadyOwnedByYou" || name === "BucketAlreadyExists") {
      return;
    }
    throw e;
  }
}

export async function putObject(
  bucket: Bucket,
  key: string,
  body: string | Uint8Array,
  contentType: string,
): Promise<void> {
  await send(
    new PutObjectCommand({
      Bucket: bucketName(bucket),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
    "putObject",
    bucket,
    key,
  );
}

/** Every object in a bucket, paginated past the 1000-key page limit. */
export async function listObjects(
  bucket: Bucket,
): Promise<Array<{ key: string; size: number }>> {
  const out: Array<{ key: string; size: number }> = [];
  let continuation: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName(bucket),
        ContinuationToken: continuation,
      }),
    );
    for (const item of page.Contents ?? []) {
      if (item.Key === undefined) continue;
      out.push({ key: item.Key, size: Number(item.Size ?? 0) });
    }
    continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuation);
  return out;
}

export async function getObject(
  bucket: Bucket,
  key: string,
): Promise<{ body: Buffer; size: number }> {
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucketName(bucket), Key: key }),
    );
    const bytes = await res.Body!.transformToByteArray();
    return {
      body: Buffer.from(bytes),
      size: Number(res.ContentLength ?? bytes.byteLength),
    };
  } catch (e) {
    if (isMissing(e)) throw new StorageError("not_found");
    throw e;
  }
}

export async function getObjectRange(
  bucket: Bucket,
  key: string,
  start: number,
  end: number,
): Promise<{ body: ReadableStream<Uint8Array>; size: number }> {
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: bucketName(bucket),
        Key: key,
        Range: `bytes=${start}-${end}`,
      }),
    );
    const total = res.ContentRange
      ? Number(res.ContentRange.split("/")[1])
      : Number(res.ContentLength ?? 0);
    return { body: res.Body!.transformToWebStream(), size: total };
  } catch (e) {
    if (isMissing(e)) throw new StorageError("not_found");
    throw e;
  }
}

export async function deleteObject(
  bucket: Bucket,
  key: string,
): Promise<void> {
  await client.send(
    new DeleteObjectCommand({ Bucket: bucketName(bucket), Key: key }),
  );
}

/** Throws unless the bucket has no anonymous-read policy. */
export async function assertNoAnonymousRead(bucket: Bucket): Promise<void> {
  let policy = "";
  try {
    const res = await client.send(
      new GetBucketPolicyCommand({ Bucket: bucketName(bucket) }),
    );
    policy = res.Policy ?? "";
  } catch (e) {
    if ((e as { name?: string }).name === "NoSuchBucketPolicy") return;
    throw e;
  }
  let parsed: {
    Statement?: Array<{
      Effect?: string;
      Principal?: string | { AWS?: string };
    }>;
  };
  try {
    parsed = JSON.parse(policy || "{}");
  } catch {
    // Some S3-compatible servers (the Adobe S3 mock) answer with XML; they do
    // not implement bucket policies, so there is no anonymous grant to find.
    return;
  }
  const grantsAnonymous = (parsed.Statement ?? []).some((statement) => {
    if (statement.Effect !== "Allow") return false;
    const principal = statement.Principal;
    return (
      principal === "*" ||
      (typeof principal === "object" &&
        principal !== null &&
        principal.AWS === "*")
    );
  });
  if (grantsAnonymous) throw new StorageError("anonymous_read_policy");
}

export { HeadObjectCommand };