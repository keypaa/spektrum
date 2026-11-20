import { NextRequest, NextResponse } from "next/server";
import { getObject } from "@spektrum/storage";
import { StorageError } from "@spektrum/storage";
import { requireUser } from "@/auth/session";
import { errorResponse } from "@/auth/route-errors";
import { ProjectNotFoundError, getDocumentById } from "@/lib/documents";

// GET /api/projects/:projectId/documents/:documentId/download
//   -> the document as an attachment with an attachment Content-Disposition.
// The filename is the basename, JSON-quoted, with any `"`/CR/LF stripped so it
// cannot break out of the header. Uploaded binaries are served from the
// `uploads` bucket with their real type instead of being mangled as text.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  zip: "application/zip",
  tex: "application/x-tex",
  bib: "application/x-bibtex",
  csv: "text/csv",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
};

function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot <= 0) return "application/octet-stream";
  return MIME_BY_EXT[path.slice(dot + 1).toLowerCase()] ?? "application/octet-stream";
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ projectId: string; documentId: string }> },
) {
  try {
    const user = await requireUser();
    const { projectId, documentId } = await ctx.params;
    if (!isUuid(projectId) || !isUuid(documentId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const document = await getDocumentById(user.id, projectId, documentId);
    if (!document) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const basename = document.path.split("/").pop() ?? "document";
    const safe = basename.replace(/["\r\n]/g, "");
    const disposition = `attachment; filename=${JSON.stringify(safe)}`;
    const common = {
      "content-disposition": disposition,
      // A download is never rendered in the page: stop the browser from
      // sniffing a different type for an uploaded .html/.svg.
      "x-content-type-options": "nosniff",
    };

    if (document.blobKey) {
      const object = await getObject("uploads", document.blobKey);
      return new NextResponse(new Uint8Array(object.body), {
        status: 200,
        headers: {
          ...common,
          "content-type": contentTypeFor(document.path),
        },
      });
    }

    return new NextResponse(document.content ?? "", {
      status: 200,
      headers: { ...common, "content-type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    if (e instanceof ProjectNotFoundError || e instanceof StorageError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return errorResponse(e);
  }
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
