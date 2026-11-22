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
  // Canonical spelling matters because the path is also the storage key.
  // Browsers on macOS send NFD (e + combining accent), while other sources
  // send NFC; two spellings of the same name must not become two documents.
  const value = input.normalize("NFC");
  if (value.trim() === "") throw new DocumentPathError("empty");
  if (value.length > MAX_PATH_LENGTH) throw new DocumentPathError("too_long");
  if (value.startsWith("/")) throw new DocumentPathError("absolute");
  if (value.includes("\\")) throw new DocumentPathError("separator");
  if (/[\u0000-\u001f]/.test(value)) throw new DocumentPathError("characters");

  const segments = value.split("/");
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
 * Unicode spellings of the same string: the value itself, its NFC form and its
 * NFD form. Used to reach rows and object-store keys written before paths were
 * canonicalised, without rewriting user data in place.
 */
export function unicodeVariants(value: string): string[] {
  return [...new Set([value, value.normalize("NFC"), value.normalize("NFD")])];
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