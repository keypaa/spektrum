// Server-side text extraction from PDFs stored in the uploads bucket.
// pdfjs-dist is already used this way in apps/worker/src/compile.ts.

import { getDocumentByPath } from "@/lib/documents";
import { getDocumentObject } from "@/lib/document-blob";

const MAX_PDF_CHARS = 30_000;
const CACHE_LIMIT = 20;
const CACHE_TTL_MS = 10 * 60 * 1000;
const TRUNCATION_NOTE =
  "[truncated — use read_pdf(path, pages) for more]";

export interface ExtractedPdfText {
  text: string;
  pages: number;
  truncated: boolean;
}

interface CacheEntry {
  pages: string[];
  expires: number;
}

const cache = new Map<string, CacheEntry>();

async function cachedPages(
  blobKey: string,
  load: () => Promise<string[]>,
): Promise<string[]> {
  const hit = cache.get(blobKey);
  if (hit && hit.expires > Date.now()) return hit.pages;
  const pages = await load();
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(blobKey, { pages, expires: Date.now() + CACHE_TTL_MS });
  return pages;
}

/** Extract text from a workspace PDF, optionally limited to a page range. */
export async function extractPdfText(
  userId: string,
  projectId: string,
  path: string,
  pages?: [number, number],
): Promise<ExtractedPdfText> {
  // Owner-scoped: the storage key never comes from the client.
  const doc = await getDocumentByPath(userId, projectId, path);
  if (!doc) throw new Error("document not found");
  if (doc.content !== null && doc.content !== undefined) {
    return { text: doc.content, pages: 1, truncated: false };
  }
  if (!doc.blobKey || !path.toLowerCase().endsWith(".pdf")) {
    throw new Error("document is not a readable PDF");
  }

  const blobKey = doc.blobKey;
  const pageTexts = await cachedPages(blobKey, async () => {
    const object = await getDocumentObject(blobKey);
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await getDocument({ data: new Uint8Array(object.body) }).promise;
    try {
      const result: string[] = [];
      for (let page = 1; page <= pdf.numPages; page += 1) {
        const content = await (await pdf.getPage(page)).getTextContent();
        const text = content.items
          .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
          .join(" ")
          .trim();
        result.push(
          `--- page ${page} ---\n${
            text || `[page ${page}: no extractable text]`
          }`,
        );
      }
      return result;
    } finally {
      await pdf.cleanup();
    }
  });

  const first = Math.max(1, Math.min(pages?.[0] ?? 1, pageTexts.length));
  const last = Math.max(first, Math.min(pages?.[1] ?? pageTexts.length, pageTexts.length));
  const selected = pageTexts.slice(first - 1, last);
  let text = selected.join("\n\n");
  const truncated = text.length > MAX_PDF_CHARS;
  if (truncated) text = `${text.slice(0, MAX_PDF_CHARS)}\n${TRUNCATION_NOTE}`;
  return { text, pages: selected.length, truncated };
}
