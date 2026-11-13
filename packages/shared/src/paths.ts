// Document paths: validation for client input and sanitisation for TeX log
// lines. Pure (no DB, no Node-only imports) so the web app and the worker
// share one implementation.

export type DocumentPathErrorCode =
  | "empty"
  | "absolute"
  | "traversal"
  | "separator"
  | "characters"
  | "too_long";

export class DocumentPathError extends Error {
  code: DocumentPathErrorCode;
  constructor(code: DocumentPathErrorCode) {
    super(`invalid document path: ${code}`);
    this.name = "DocumentPathError";
    this.code = code;
  }
}

const MAX_PATH_LENGTH = 200;

/**
 * Validate and normalise a client-supplied path.
 *
 * Rejects absolute paths, `..` traversal, backslashes, control characters and
 * over-long names; collapses duplicate separators. There is no `path.resolve`
 * here on purpose — anything that could escape the project root is refused
 * rather than rewritten.
 */
export function normalizeDocumentPath(input: string): string {
  if (input.trim() === "") throw new DocumentPathError("empty");
  if (input.length > MAX_PATH_LENGTH) throw new DocumentPathError("too_long");
  if (input.startsWith("/")) throw new DocumentPathError("absolute");
  if (input.includes("\\")) throw new DocumentPathError("separator");
  if (/[\u0000-\u001f]/.test(input)) throw new DocumentPathError("characters");

  const segments = input.split("/");
  for (const segment of segments) {
    if (segment === ".." || segment === ".") {
      throw new DocumentPathError("traversal");
    }
  }

  const normalised = segments.filter((s) => s !== "").join("/");
  if (normalised === "") throw new DocumentPathError("empty");
  if (normalised.length > MAX_PATH_LENGTH) {
    throw new DocumentPathError("too_long");
  }
  return normalised;
}

/**
 * Non-throwing sanitiser for a path parsed out of a TeX log (`file.tex:12:`).
 * A hostile log must not fail the compile: strip a leading `./`, drop `..`
 * segments, replace backslashes and control characters, and cap the length.
 */
export function sanitizeDiagnosticPath(input: string): string {
  const unified = input
    .replace(/\\/g, "/")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/^\.\//, "");
  const safe = unified
    .split("/")
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
    .join("/");
  return safe.slice(0, MAX_PATH_LENGTH);
}