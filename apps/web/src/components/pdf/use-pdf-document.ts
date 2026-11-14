// pdfjs loading (spec §8.2). The legacy build works in both the browser and
// Node (the browser build needs DOMMatrix, which Node tests do not have).
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

/** Load a PDF from a URL (the auth-checked render route). */
export async function loadPdfDocument(
  url: string,
): Promise<PDFDocumentProxy | null> {
  try {
    return await pdfjs.getDocument({ url }).promise;
  } catch {
    return null;
  }
}

/** Load a PDF from bytes (Node tests, and the visual fixture). */
export async function loadPdfData(
  data: Uint8Array,
): Promise<PDFDocumentProxy | null> {
  try {
    return await pdfjs.getDocument({ data }).promise;
  } catch {
    return null;
  }
}