// Restore every object of both buckets from a backup directory (restore side).
//
//   pnpm exec tsx scripts/restore-objects.ts <dir>
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { putObject, type Bucket } from "@spektrum/storage";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".tex": "application/x-tex",
  ".bib": "application/x-bibtex",
  ".csv": "text/csv",
};

const contentType = (key: string): string => {
  const dot = key.lastIndexOf(".");
  return (dot > 0 && CONTENT_TYPES[key.slice(dot).toLowerCase()]) || "application/octet-stream";
};

/** Every file under `dir`, as paths relative to `dir`. */
const walk = async (dir: string, prefix = ""): Promise<string[]> => {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await walk(join(dir, entry.name), relative)));
    else out.push(relative);
  }
  return out;
};

const main = async (): Promise<void> => {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: restore-objects.ts <dir>");
    process.exitCode = 1;
    return;
  }

  for (const bucket of ["uploads", "pdf"] as Bucket[]) {
    const root = join(dir, bucket);
    let keys: string[] = [];
    try {
      keys = await walk(root);
    } catch {
      console.log(`no ${bucket} objects in ${dir}`);
      continue;
    }
    for (const key of keys) {
      const body = await readFile(join(root, key));
      await putObject(bucket, key, new Uint8Array(body), contentType(key));
    }
    console.log(`restored ${keys.length} objects to ${bucket}`);
  }
};

main().catch((e: unknown) => {
  console.error("restore-objects failed:", e);
  process.exitCode = 1;
});