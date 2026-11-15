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

export type Bucket = "pdf" | "uploads";

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

const endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
const accessKeyId = process.env.S3_ACCESS_KEY ?? "spektrum";
const secretAccessKey = process.env.S3_SECRET_KEY ?? "spektrum-secret";

const client = new S3Client({
  endpoint,
  region: "us-east-1",
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

/** Create a bucket if it does not exist (dev/MinIO). */
export async function ensureBucket(bucket: Bucket): Promise<void> {
  try {
    await client.send(
      new CreateBucketCommand({ Bucket: bucketName(bucket) }),
    );
  } catch {
    /* already exists */
  }
}

export async function putObject(
  bucket: Bucket,
  key: string,
  body: string | Uint8Array,
  contentType: string,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName(bucket),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
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