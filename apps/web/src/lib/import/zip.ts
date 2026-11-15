// ZIP reader/writer for Prism import/export (spec §13).
//
// `readZip` is a security boundary: a Prism archive is untrusted input, so it
// streams with fflate's `Unzip` (never `unzipSync`, which materialises the
// whole archive before any check) and enforces four caps:
//
//   - per-entry declared size        (`maxFileBytes`)
//   - per-entry actual inflated size  (`maxFileBytes`, the backstop for a
//     forged header: a stream that inflates past the cap is aborted)
//   - whole-archive inflated size     (`maxTotalBytes`)
//   - entry count                     (`maxEntries`)
//   - per-entry compression ratio     (`maxRatio`, from the central directory)
//
// Inflation is driven in 16 KiB compressed chunks so a bomb cannot expand a
// whole entry inside one `push` call: the running totals are checked between
// chunks and the stream is terminated as soon as a cap is crossed.
import { Unzip, UnzipInflate, zipSync } from "fflate";

export type ZipEntry = {
  path: string;
  data: Uint8Array;
  originalSize: number;
  compressedSize: number;
};

export type ZipErrorCode = "too_large" | "too_many" | "ratio" | "bad_zip";

export class ZipError extends Error {
  code: ZipErrorCode;
  constructor(code: ZipErrorCode) {
    super(`invalid zip archive: ${code}`);
    this.name = "ZipError";
    this.code = code;
  }
}

export type ZipLimits = {
  maxFileBytes: number;
  maxTotalBytes: number;
  maxEntries: number;
  maxRatio: number;
};

/** Defaults; production reads its values from `IMPORT_MAX_*` (Task 12). */
export const ZIP_LIMITS: ZipLimits = {
  maxFileBytes: 26_214_400,
  maxTotalBytes: 536_870_912,
  maxEntries: 50_000,
  maxRatio: 100,
};

const CHUNK = 16 * 1024;
/** Fixed archive timestamp: identical content must produce identical bytes. */
const FIXED_MTIME = new Date("2020-01-01T00:00:00Z");

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  if (chunks.length === 1 && chunks[0]!.byteLength === size) return chunks[0]!;
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

export function readZip(
  bytes: Uint8Array,
  limits: ZipLimits = ZIP_LIMITS,
): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let failure: ZipError | null = null;
  let total = 0;
  let count = 0;

  const fail = (code: ZipErrorCode) => {
    if (!failure) failure = new ZipError(code);
  };

  const unzip = new Unzip((file) => {
    // Once a cap is crossed every later entry is skipped without inflating it.
    if (failure) return;
    count += 1;
    if (count > limits.maxEntries) {
      fail("too_many");
      return;
    }

    // `size`/`originalSize` are absent for archives written with a data
    // descriptor (streaming zips); those fall back to actual-byte counting.
    const compressed = file.size ?? 0;
    const declared = file.originalSize ?? 0;
    if (declared > limits.maxFileBytes) {
      fail("too_large");
      return;
    }
    if (compressed > 0 && declared / compressed > limits.maxRatio) {
      fail("ratio");
      return;
    }

    const chunks: Uint8Array[] = [];
    let size = 0;

    file.ondata = (err, chunk, final) => {
      if (failure) return;
      if (err) {
        fail("bad_zip");
        file.terminate();
        return;
      }
      if (chunk && chunk.byteLength > 0) {
        size += chunk.byteLength;
        total += chunk.byteLength;
        if (size > limits.maxFileBytes || total > limits.maxTotalBytes) {
          fail("too_large");
          file.terminate();
          return;
        }
        // The final call carries the last block, so it is appended too.
        chunks.push(chunk);
      }
      if (final) {
        entries.push({
          path: file.name,
          data: concat(chunks, size),
          originalSize: declared,
          compressedSize: compressed,
        });
      }
    };

    file.start();
  });
  unzip.register(UnzipInflate);

  try {
    for (let at = 0; at < bytes.length && !failure; at += CHUNK) {
      unzip.push(bytes.subarray(at, Math.min(at + CHUNK, bytes.length)), false);
    }
    if (!failure && bytes.length > 0) unzip.push(new Uint8Array(0), true);
  } catch {
    // fflate throws plain errors (with a numeric code) on malformed input.
    throw new ZipError("bad_zip");
  }

  if (failure) throw failure;
  return entries;
}

/** Deterministic ZIP writer used by the exporter and the tests. */
export function writeZip(
  files: Array<{ path: string; data: Uint8Array }>,
): Uint8Array {
  const zippable: Record<string, Uint8Array> = {};
  for (const file of files) {
    // A `Zippable` is keyed by path, so a duplicate would silently overwrite
    // the earlier entry and produce a corrupt "backup" with no error.
    if (Object.hasOwn(zippable, file.path)) {
      throw new ZipError("bad_zip");
    }
    zippable[file.path] = file.data;
  }
  return zipSync(zippable, { level: 6, mtime: FIXED_MTIME });
}