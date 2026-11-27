// Client helpers for the document API (Task 4 endpoints), plus the file-name
// normalisation the New file dialog uses.

import type { DocumentRecord, UploadResult } from "@/lib/documents";
import { uploadBytesToR2 } from "@/lib/upload/client";

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `request failed: ${res.status}`;
  } catch {
    return `request failed: ${res.status}`;
  }
}

export async function createDocumentRequest(
  projectId: string,
  path: string,
): Promise<DocumentRecord> {
  const res = await fetch(`/api/projects/${projectId}/documents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { document: DocumentRecord };
  return body.document;
}

/** Upload files into the project's workspace (drag-drop, button and chat). */
export async function uploadDocumentsRequest(
  projectId: string,
  files: File[],
): Promise<UploadResult> {
  // Bytes go to R2 first; the route receives only the signed keys. The
  // extension is taken from the file name and normalised for the scoped key.
  const payload = await Promise.all(
    files.map(async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "";
      const ext = /^[a-z0-9]{1,16}$/.test(rawExt) ? rawExt : "bin";
      const contentType = file.type || "application/octet-stream";
      const blobKey = await uploadBytesToR2({
        bytes,
        contentType,
        kind: "workspace",
        ext,
        projectId,
      });
      return { name: file.name, blobKey, contentType: file.type || undefined };
    }),
  );
  const res = await fetch(`/api/projects/${projectId}/upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files: payload }),
  });
  if (!res.ok) throw new Error((await readError(res)) || "Upload failed");
  return (await res.json()) as UploadResult;
}

/** Read one document's content by path (spec §19.2's GET ?path=). */
export async function getDocumentRequest(
  projectId: string,
  path: string,
): Promise<DocumentRecord> {
  const res = await fetch(
    `/api/projects/${projectId}/documents?path=${encodeURIComponent(path)}`,
  );
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { document: DocumentRecord };
  return body.document;
}

export async function renameDocumentRequest(
  projectId: string,
  documentId: string,
  path: string,
): Promise<DocumentRecord> {
  const res = await fetch(
    `/api/projects/${projectId}/documents/${documentId}/rename`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { document: DocumentRecord };
  return body.document;
}

export async function deleteDocumentRequest(
  projectId: string,
  documentId: string,
): Promise<void> {
  const res = await fetch(
    `/api/projects/${projectId}/documents/${documentId}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 204) throw new Error(await readError(res));
}

/** Trim, and append `.tex` when there is no dot in the name (D26). */
export function normalizeNewFileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return trimmed.includes(".") ? trimmed : `${trimmed}.tex`;
}

export const DUPLICATE_PATH_MESSAGE = "A file with that name already exists.";