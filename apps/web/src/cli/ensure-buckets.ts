// Ensure the S3 buckets exist. Run once after the object store starts:
// SeaweedFS/MinIO have no implicit bucket creation, and the app only writes to
// a bucket that is already there.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const envLocal = resolve(import.meta.dirname, "../../.env.local");
if (existsSync(envLocal)) process.loadEnvFile(envLocal);

import { ensureBucket, type Bucket } from "@spektrum/storage";

const buckets: Bucket[] = ["uploads", "pdf"];

const main = async (): Promise<void> => {
  for (const bucket of buckets) {
    await ensureBucket(bucket);
    console.log(`bucket ready: ${bucket}`);
  }
};

main().catch((e: unknown) => {
  console.error("ensure-buckets failed:", e);
  process.exitCode = 1;
});