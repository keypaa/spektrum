// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_LIMITS, type ImageMimeType } from "@spektrum/shared/ai";
import { readPastedImages } from "./image-paste";

// The browser hands the encoded bytes to an uploader instead of embedding
// base64 in the chat request; tests supply a fake uploader and inspect its
// arguments.
const upload = vi.fn(async (bytes: Uint8Array, mimeType: ImageMimeType) => ({
  id: `ref-${bytes.byteLength}`,
  blobKey: `u/u1/chat-image/${crypto.randomUUID()}.png`,
  mimeType,
  name: "shot.png",
}));

const drawn: Array<[number, number]> = [];
let encodedBytes = new Uint8Array([1, 2, 3, 4]);
let encodeMime = "";
let encodeQuality = 0;

function item(file: File | null, type: string, kind = "file"): DataTransferItem {
  return { kind, type, getAsFile: () => file } as unknown as DataTransferItem;
}

function png(): File {
  return new File(["x"], "paste.png", { type: "image/png" });
}

function stubBitmap(bitmap: { width: number; height: number; close?: () => void }): void {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
}

beforeEach(() => {
  drawn.length = 0;
  encodedBytes = new Uint8Array([1, 2, 3, 4]);
  encodeMime = "";
  encodeQuality = 0;
  upload.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: (
      _image: unknown,
      _dx: number,
      _dy: number,
      width: number,
      height: number,
    ) => {
      drawn.push([width, height]);
    },
  } as unknown as CanvasRenderingContext2D);
  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
    configurable: true,
    value: (callback: BlobCallback, type?: string, quality?: number) => {
      encodeMime = type ?? "";
      encodeQuality = quality ?? 0;
      callback(new Blob([encodedBytes], { type: type ?? "" }));
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).toBlob;
});

describe("readPastedImages", () => {
  it("downscales a 3000px image to 1536px and encodes WebP", async () => {
    stubBitmap({ width: 3000, height: 2000, close: () => undefined });

    const result = await readPastedImages([item(png(), "image/png")], upload);

    expect(drawn).toEqual([[1536, 1024]]);
    expect(encodeMime).toBe("image/webp");
    expect(encodeQuality).toBeGreaterThan(0);
    expect(result).toHaveLength(1);
    expect(result[0]!.mimeType).toBe("image/webp");
    expect(result[0]!.blobKey).toMatch(/^u\/u1\/chat-image\//);
    expect(Array.from(upload.mock.calls[0]![0])).toEqual([1, 2, 3, 4]);
    expect(upload.mock.calls[0]![1]).toBe("image/webp");
  });

  it("leaves a small image at its original size", async () => {
    stubBitmap({ width: 800, height: 600, close: () => undefined });

    await readPastedImages([item(png(), "image/png")], upload);

    expect(drawn).toEqual([[800, 600]]);
  });

  it("rejects non-image clipboard items", async () => {
    const createBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createBitmap);

    const result = await readPastedImages(
      [
        item(null, "text/plain", "string"),
        item(new File(["x"], "a.pdf", { type: "application/pdf" }), "application/pdf"),
        item(new File(["x"], "a.bmp", { type: "image/bmp" }), "image/bmp"),
      ],
      upload,
    );

    expect(result).toEqual([]);
    expect(createBitmap).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("caps pasted images at the shared limit", async () => {
    const createBitmap = vi.fn(async () => ({
      width: 10,
      height: 10,
      close: () => undefined,
    }));
    vi.stubGlobal("createImageBitmap", createBitmap);

    const result = await readPastedImages(
      Array.from({ length: 5 }, () => item(png(), "image/png")),
      upload,
    );

    expect(result).toHaveLength(IMAGE_LIMITS.maxCount);
    expect(createBitmap).toHaveBeenCalledTimes(IMAGE_LIMITS.maxCount);
    expect(upload).toHaveBeenCalledTimes(IMAGE_LIMITS.maxCount);
  });

  it("drops an image that cannot be decoded", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("corrupt image");
      }),
    );

    expect(await readPastedImages([item(png(), "image/png")], upload)).toEqual([]);
    expect(upload).not.toHaveBeenCalled();
  });

  it("drops an image still over the decoded byte cap after downscale", async () => {
    stubBitmap({ width: 20, height: 20, close: () => undefined });
    encodedBytes = new Uint8Array(IMAGE_LIMITS.maxBytesPerImage + 1);

    expect(await readPastedImages([item(png(), "image/png")], upload)).toEqual([]);
    expect(upload).not.toHaveBeenCalled();
  });

  it("labels the attachment with the actual MIME when WebP falls back to PNG", async () => {
    stubBitmap({ width: 10, height: 10, close: () => undefined });
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
      configurable: true,
      value: (callback: BlobCallback) => {
        callback(new Blob([encodedBytes], { type: "image/png" }));
      },
    });

    const result = await readPastedImages([item(png(), "image/png")], upload);

    expect(result).toHaveLength(1);
    expect(result[0]!.mimeType).toBe("image/png");
  });

  it("skips an oversized source file before createImageBitmap", async () => {
    const createBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createBitmap);
    const big = png();
    Object.defineProperty(big, "size", { value: 20 * 1024 * 1024 + 1 });

    expect(await readPastedImages([item(big, "image/png")], upload)).toEqual([]);
    expect(createBitmap).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("drops an image whose upload fails", async () => {
    stubBitmap({ width: 10, height: 10, close: () => undefined });
    upload.mockRejectedValueOnce(new Error("upload failed: 403"));

    expect(await readPastedImages([item(png(), "image/png")], upload)).toEqual([]);
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
