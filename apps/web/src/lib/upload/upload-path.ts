// Uploaded files keep their own name at the project root, so `main.tex` can
// reference them directly (e.g. `\includegraphics{pdf (1).pdf}`).
import { normalizeDocumentPath } from "@spektrum/shared/paths";

export class UploadNameError extends Error {
  constructor() {
    super("invalid upload name");
    this.name = "UploadNameError";
  }
}

/**
 * Turn a browser-supplied file name into a safe project path.
 *
 * Browsers may hand us a full path from a folder drop (`C:\draft\paper.pdf`),
 * so only the basename is kept. Traversal and control characters are discarded
 * rather than interpreted, and the shared path validator gets the final say.
 */
export function uploadPathFor(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/^\.+/, "")
    .trim();
  if (!cleaned) throw new UploadNameError();
  try {
    return normalizeDocumentPath(cleaned);
  } catch {
    throw new UploadNameError();
  }
}
