// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadDocumentsRequest } from "./document-client";

afterEach(() => vi.unstubAllGlobals());

describe("uploadDocumentsRequest", () => {
  it("signs and PUTs each file to R2 before posting only the keys", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url === "/api/uploads/sign") {
          return new Response(
            JSON.stringify({
              key: `u/u1/workspace/${calls.length}-11111111-1111-4000-8000-000000000000.bin`,
              url: "https://r2.test/put",
              headers: { "Content-Type": "application/pdf" },
              expiresAt: "2026-11-27T12:00:00.000Z",
            }),
            { status: 201 },
          );
        }
        if (url === "https://r2.test/put") return new Response(null, { status: 200 });
        return new Response(
          JSON.stringify({ documents: [{ path: "paper.pdf" }], skipped: [] }),
          { status: 201 },
        );
      }),
    );

    const files = [
      new File([new Uint8Array([1, 2])], "paper.pdf", { type: "application/pdf" }),
      new File([new Uint8Array([3])], "notes#draft", { type: "" }),
    ];
    const result = await uploadDocumentsRequest("project-1", files);
    expect(result.documents.map((d) => d.path)).toEqual(["paper.pdf"]);

    // Both files are signed first (Promise.all), then both bytes are PUT.
    expect(calls.map((c) => c.url)).toEqual([
      "/api/uploads/sign",
      "/api/uploads/sign",
      "https://r2.test/put",
      "https://r2.test/put",
      "/api/projects/project-1/upload",
    ]);
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      kind: "workspace",
      ext: "pdf",
      contentType: "application/pdf",
      sizeBytes: 2,
    });
    expect(JSON.parse(String(calls[1]!.init?.body))).toEqual({
      kind: "workspace",
      ext: "bin",
      contentType: "application/octet-stream",
      sizeBytes: 1,
    });
    expect(calls[2]!.init?.method).toBe("PUT");
    expect(calls[3]!.init?.method).toBe("PUT");
    const posted = JSON.parse(String(calls[4]!.init?.body)) as {
      files: Array<{ name: string; blobKey: string; contentType?: string }>;
    };
    expect(posted.files.map((f) => f.name)).toEqual(["paper.pdf", "notes#draft"]);
    expect(posted.files[0]!.blobKey).toContain("/workspace/");
    expect(posted.files[0]!.contentType).toBe("application/pdf");
    expect(posted.files[1]!.contentType).toBeUndefined();
  });
});
