/** Lowercase hex SHA-256 of raw bytes. Same digest as `sha256Hex`. */
export async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  // `BufferSource` is typed against `ArrayBuffer` (never `SharedArrayBuffer`),
  // so the view is copied into a fresh, non-shared buffer.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** Lowercase hex SHA-256. Uses Web Crypto so it works in the browser and Node. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}