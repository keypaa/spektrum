// Client helpers for the document API (Task 4 endpoints), plus the file-name
// normalisation the New file dialog uses.

import type { DocumentRecord } from "@/lib/documents";

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