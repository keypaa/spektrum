// Magic-byte sniffing for uploads (spec §10.6).
//
// Content type is decided from the bytes, never from the file name or the
// client's declared type: a `.png` that starts with `<html>` is not an image.
// The table is deliberately small — only the formats we accept as uploads.
export type Sniffed =
  | "application/zip"
  | "image/png"
  | "image/jpeg"
  | "application/pdf";

const SIGNATURES: Array<{ type: Sniffed; test: (b: Uint8Array) => boolean }> = [
  { type: "application/zip", test: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) },
  { type: "image/png", test: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { type: "image/jpeg", test: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { type: "application/pdf", test: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.byteLength < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

/** The detected content type, or null when nothing matches. */
export function sniffContentType(bytes: Uint8Array): Sniffed | null {
  for (const candidate of SIGNATURES) {
    if (candidate.test(bytes)) return candidate.type;
  }
  return null;
}

/** The detected content type, or `application/octet-stream`. */
export function contentTypeOf(bytes: Uint8Array): string {
  return sniffContentType(bytes) ?? "application/octet-stream";
}

export class SniffError extends Error {
  constructor(message = "unsupported file content") {
    super(message);
    this.name = "SniffError";
  }
}

/** Throws unless the bytes are a ZIP archive (a Prism export). */
export function assertZipMagic(bytes: Uint8Array): void {
  if (sniffContentType(bytes) !== "application/zip") {
    throw new SniffError("not a zip archive");
  }
}