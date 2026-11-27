// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadBytesToR2 } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadBytesToR2", () => {
  it("signs first, PUTs the bytes with the signed headers, and returns the key", async () => {
    const signed = {
      key: "u/u1/import/00000000-0000-4000-8000-000000000000.zip",
      url: "https://r2.test/upload?X-Amz-Signature=abc",
      headers: { "Content-Type": "application/zip" },
      expiresAt: "2026-11-27T12:00:00.000Z",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === "/api/uploads/sign") {
        return new Response(JSON.stringify(signed), { status: 201 });
      }
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const bytes = new Uint8Array([1, 2, 3]);
    const key = await uploadBytesToR2({
      bytes,
      contentType: "application/zip",
      kind: "import",
      ext: "zip",
    });

    expect(key).toBe(signed.key);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [signInput, signInit] = fetchMock.mock.calls[0]!;
    expect(String(signInput)).toBe("/api/uploads/sign");
    expect(signInit?.method).toBe("POST");
    expect(JSON.parse(String(signInit?.body))).toEqual({
      kind: "import",
      ext: "zip",
      contentType: "application/zip",
      sizeBytes: 3,
    });
    const [putInput, putInit] = fetchMock.mock.calls[1]!;
    expect(String(putInput)).toBe(signed.url);
    expect(putInit?.method).toBe("PUT");
    expect(putInit?.headers).toEqual(signed.headers);
    expect(putInit?.body).toBe(bytes);
  });

  it("throws the signed route's error and never PUTs when signing fails", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "too_large" }), { status: 413 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      uploadBytesToR2({
        bytes: new Uint8Array([1]),
        contentType: "application/zip",
        kind: "import",
        ext: "zip",
      }),
    ).rejects.toThrow("too_large");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the direct PUT fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/uploads/sign") {
        return new Response(
          JSON.stringify({
            key: "u/u1/workspace/00000000-0000-4000-8000-000000000000.pdf",
            url: "https://r2.test/upload",
            headers: { "Content-Type": "application/pdf" },
            expiresAt: "2026-11-27T12:00:00.000Z",
          }),
          { status: 201 },
        );
      }
      return new Response(null, { status: 403 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      uploadBytesToR2({
        bytes: new Uint8Array([1]),
        contentType: "application/pdf",
        kind: "workspace",
        ext: "pdf",
        projectId: "project-1",
      }),
    ).rejects.toThrow(/upload failed.*403/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
