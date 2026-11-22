# Documents and PDFs

## Where files live

`documents` rows are the source of truth for project files.

- Small text files (≤ 512 KiB) are stored inline in `documents.content`.
- Binary files and larger files are stored in the `spektrum-uploads` S3 bucket;
  the row keeps a `blob_key`. PDFs and images are always blobs, even when their
  bytes happen to be valid UTF-8, so the original file is preserved.
- Rendered PDFs and SyncTeX data go to the `spektrum-pdf` bucket.

The document path is also the blob key suffix. Paths are canonicalised to
Unicode NFC on write, and reads try the NFC/NFD variants. This keeps files
uploaded from different platforms (macOS often sends NFD) addressable without a
destructive migration; see `packages/shared/src/paths.ts` and
`apps/web/src/lib/document-blob.ts`.

## Opening a PDF

Clicking a PDF in the file tree opens it in the editor area with the same
PDF.js viewer used for compiled output. Images get an inline preview instead of
an empty Monaco buffer.

The viewer renders a transparent PDF.js text layer over the canvas, so text in
both compiled and uploaded PDFs can be selected and copied. The PDF.js worker
is copied next to the server chunks at build time by
`apps/web/scripts/copy-pdf-worker.mjs`.

## Text extraction and scans

`read_pdf` and the context builder extract text server-side with `pdfjs-dist`.
A PDF with a real text layer works normally.

A **scanned** PDF has no text layer: every page comes back as
`[page N: no extractable text]`. Spektrum does not currently run OCR. For a scan,
open it in the viewer to read it visually, or supply an OCR'd/text-based version
if you want the assistant to work from its contents.

Free models occasionally claim a PDF is "image-based" even when extraction
succeeded — the context and the tool use the same canonical path resolution now,
so this should not be caused by a Unicode mismatch. Check whether the PDF has a
text layer before suspecting the gateway.
