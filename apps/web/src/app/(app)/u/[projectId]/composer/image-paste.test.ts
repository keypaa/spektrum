// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_LIMITS } from "@spektrum/shared/ai";
import { readPastedImages } from "./image-paste";

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

    const result = await readPastedImages([item(png(), "image/png")]);

    expect(drawn).toEqual([[1536, 1024]]);
    expect(encodeMime).toBe("image/webp");
    expect(encodeQuality).toBeGreaterThan(0);
    expect(result).toHaveLength(1);
    expect(result[0]!.mimeType).toBe("image/webp");
    expect(result[0]!.data).toBe(btoa("\u0001\u0002\u0003\u0004"));
  });

  it("leaves a small image at its original size", async () => {
    stubBitmap({ width: 800, height: 600, close: () => undefined });

    await readPastedImages([item(png(), "image/png")]);

    expect(drawn).toEqual([[800, 600]]);
  });

  it("rejects non-image clipboard items", async () => {
    const createBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createBitmap);

    const result = await readPastedImages([
      item(null, "text/plain", "string"),
      item(new File(["x"], "a.pdf", { type: "application/pdf" }), "application/pdf"),
      item(new File(["x"], "a.bmp", { type: "image/bmp" }), "image/bmp"),
    ]);

    expect(result).toEqual([]);
    expect(createBitmap).not.toHaveBeenCalled();
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
    );

    expect(result).toHaveLength(IMAGE_LIMITS.maxCount);
    expect(createBitmap).toHaveBeenCalledTimes(IMAGE_LIMITS.maxCount);
  });

  it("drops an image that cannot be decoded", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("corrupt image");
      }),
    );

    expect(await readPastedImages([item(png(), "image/png")])).toEqual([]);
  });

  it("drops an image still over the decoded byte cap after downscale", async () => {
    stubBitmap({ width: 20, height: 20, close: () => undefined });
    encodedBytes = new Uint8Array(IMAGE_LIMITS.maxBytesPerImage + 1);

    expect(await readPastedImages([item(png(), "image/png")])).toEqual([]);
  });
});
