// Hidden-file matching for the file tree (spec §9.6).
//
// Deliberately NOT a general glob engine. A pattern is split on `*`; the first
// segment is anchored at the start of the path and the last at the end, and any
// segments in between must appear in order. That covers every form the spec's
// list uses:
//
//   *.aux            → suffix
//   *.synctex.gz     → multi-dot suffix
//   *~               → suffix
//   .git             → exact match (no wildcard)
//   node_modules     → exact match (no wildcard)
//
// Not supported: `**` (treated as two consecutive `*` segments, which still
// behaves sensibly) and `?` (matched literally). Document that rather than
// pretending to implement them.

export function matchHiddenFile(
  path: string,
  globs: readonly string[],
): boolean {
  return globs.some((glob) => matchOne(path, glob));
}

function matchOne(path: string, glob: string): boolean {
  if (!glob.includes("*")) return path === glob;

  const parts = glob.split("*");
  const prefix = parts[0]!;
  const suffix = parts[parts.length - 1]!;
  const middle = parts.slice(1, -1);

  if (path.length < prefix.length + suffix.length) return false;
  if (!path.startsWith(prefix)) return false;
  if (!path.endsWith(suffix)) return false;

  // Search only the region between the anchored ends, in order.
  const start = prefix.length;
  const end = path.length - suffix.length;
  let cursor = start;
  for (const part of middle) {
    if (part === "") continue;
    const found = path.indexOf(part, cursor);
    if (found === -1 || found + part.length > end) return false;
    cursor = found + part.length;
  }
  return true;
}