// Object-store readiness probe (spec §19).
//
// Creating a bucket only proves the S3 API answers; a fresh SeaweedFS/MinIO can
// still fail the first PutObject while its volume server comes up. The deploy and
// CI gates therefore write, read and delete a tiny object before calling the
// store ready.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const envLocal = resolve(import.meta.dirname, "../../.env.local");
if (existsSync(envLocal)) process.loadEnvFile(envLocal);

import { deleteObject, getObject, putObject } from "@spektrum/storage";

const PAYLOAD = "spektrum-s3-probe";

const main = async (): Promise<void> => {
  const key = `.probe/${crypto.randomUUID()}.txt`;
  await putObject("uploads", key, PAYLOAD, "text/plain");
  const body = await getObject("uploads", key);
  if (body.body.toString("utf8") !== PAYLOAD) {
    throw new Error("probe read back different bytes");
  }
  await deleteObject("uploads", key);
  console.log("s3 probe ok");
};

main().catch((e: unknown) => {
  console.error("s3 probe failed:", e);
  process.exitCode = 1;
});