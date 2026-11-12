// Revision hash — the cache key for `pdf_renders` (spec §19.2).
//
//   revisionHash = sha256 over `path || contentHash` of every document,
//   sorted by path.
//
// `contentHash` is fixed-width (a hex sha256), so concatenating it directly
// after the path needs no separator: "ab" + hash("c") can never collide with
// "a" + hash("bc"), because the boundary is always at the same offset.

import { createHash } from "node:crypto";

export interface RevisionDocument {
  path: string;
  content: string | null;
}

/** sha256 of the document's UTF-8 bytes; `null` hashes the empty string. */
export function contentHash(content: string | null): string {
  return createHash("sha256")
    .update(content ?? "", "utf8")
    .digest("hex");
}

/**
 * Deterministic across hosts: the sort is by UTF-16 code unit, not
 * `localeCompare`, which is locale-dependent.
 */
export function revisionHash(documents: RevisionDocument[]): string {
  const joined = documents
    .slice()
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((d) => `${d.path}${contentHash(d.content)}`)
    .join("");
  return createHash("sha256").update(joined, "utf8").digest("hex");
}