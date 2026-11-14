import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import {
  listRevisionDocuments,
  type RevisionDocumentRow,
} from "@spektrum/db/documents";
import { normalizeDocumentPath } from "@spektrum/shared/paths";
import { getObject } from "@spektrum/storage";

/** Write the project's documents into a fresh temp dir. */
export async function materialise(
  projectId: string,
): Promise<{ dir: string; documents: RevisionDocumentRow[] }> {
  const dir = await mkdtemp(join(tmpdir(), "spektrum-compile-"));
  const root = resolve(dir);
  const documents = await listRevisionDocuments(projectId);

  for (const document of documents) {
    const target = resolve(root, normalizeDocumentPath(document.path));
    if (target !== root && !target.startsWith(root + sep)) {
      throw new Error(`path escapes the work dir: ${document.path}`);
    }
    await mkdir(dirname(target), { recursive: true });
    if (document.content !== null) {
      await writeFile(target, document.content, "utf8");
    } else if (document.blobKey) {
      const object = await getObject("uploads", document.blobKey);
      await writeFile(target, object.body);
    } else {
      await writeFile(target, "");
    }
  }

  return { dir, documents };
}