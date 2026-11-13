// Document save request — spec §19.2's PATCH contract.

import type { DocumentRecord } from "./documents";

export interface SaveResult {
  documentId: string;
  updatedAt: string;
  revisionHash: string;
}

export class ConflictError extends Error {
  current: DocumentRecord;
  constructor(current: DocumentRecord) {
    super("conflict");
    this.name = "ConflictError";
    this.current = current;
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `request failed: ${res.status}`;
  } catch {
    return `request failed: ${res.status}`;
  }
}

export async function saveDocumentRequest(
  projectId: string,
  documentId: string,
  content: string,
  baseUpdatedAt: string,
  options?: { keepalive?: boolean },
): Promise<SaveResult> {
  const res = await fetch(`/api/projects/${projectId}/documents/${documentId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, baseUpdatedAt }),
    ...(options?.keepalive ? { keepalive: true } : {}),
  });
  if (res.status === 409) {
    const body = (await res.json()) as { document: DocumentRecord };
    throw new ConflictError(body.document);
  }
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as SaveResult;
}