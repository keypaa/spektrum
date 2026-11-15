// Copy every object of both buckets to a directory (backup side).
//
// Uses the app's own S3 client, so it works against any S3-compatible service
// (SeaweedFS in the reference stack, MinIO/AWS/Cloudflare R2 elsewhere) and
// needs no host tooling beyond pnpm.
//
//   pnpm exec tsx scripts/backup-objects.ts <destDir>
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getObject,
  listObjects,
  type Bucket,
} from "@spektrum/storage";

const BUCKETS: Bucket[] = ["uploads", "pdf"];

const main = async (): Promise<void> => {
  const dest = process.argv[2];
  if (!dest) {
    console.error("usage: backup-objects.ts <destDir>");
    process.exitCode = 1;
    return;
  }

  const manifest: Array<{ bucket: Bucket; key: string; bytes: number }> = [];
  for (const bucket of BUCKETS) {
    const objects = await listObjects(bucket);
    for (const object of objects) {
      const target = join(dest, bucket, object.key);
      await mkdir(join(target, ".."), { recursive: true });
      const body = await getObject(bucket, object.key);
      await writeFile(target, body.body);
      manifest.push({ bucket, key: object.key, bytes: body.size });
    }
    console.log(`backed up ${objects.length} objects from ${bucket}`);
  }

  await writeFile(
    join(dest, "manifest.json"),
    JSON.stringify({ takenAt: new Date().toISOString(), objects: manifest }, null, 2),
  );
};

main().catch((e: unknown) => {
  console.error("backup-objects failed:", e);
  process.exitCode = 1;
});