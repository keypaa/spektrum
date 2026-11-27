// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  objects: new Map<string, { body: Uint8Array; size: number }>(),
}));

vi.mock("@spektrum/storage", () => {
  class StorageError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "StorageError";
    }
  }
  return {
    StorageError,
    getObject: vi.fn(async (_bucket: string, key: string) => {
      const found = state.objects.get(key);
      if (!found) throw new StorageError("not_found");
      return { body: Buffer.from(found.body), size: found.size };
    }),
  };
});

import { getObject } from "@spektrum/storage";
import {
  chatImagePart,
  readChatImage,
  resolveChatImageRef,
} from "./image-attachments";

const USER = "user-1";
const bytes = Buffer.from("89504e470d0a1a0a", "hex");
const blobKey = `u/${USER}/chat-image/${crypto.randomUUID()}.png`;
const ref = {
  id: "client-1",
  blobKey,
  mimeType: "image/png" as const,
  name: "shot.png",
};

beforeEach(() => {
  state.objects.clear();
  vi.mocked(getObject).mockClear();
});

describe("resolveChatImageRef", () => {
  it("reads a scoped key and builds a part from the ref", async () => {
    state.objects.set(blobKey, { body: bytes, size: bytes.byteLength });

    expect(await resolveChatImageRef(USER, ref)).toEqual({
      kind: "ok",
      part: {
        type: "image",
        id: "client-1",
        blobKey,
        name: "shot.png",
        mimeType: "image/png",
      },
    });
    expect(getObject).toHaveBeenCalledWith("uploads", blobKey);
  });

  it("rejects a key owned by another user before reading the object", async () => {
    state.objects.set(blobKey, { body: bytes, size: bytes.byteLength });
    expect(await resolveChatImageRef("another-user", ref)).toEqual({
      kind: "foreign",
    });
    expect(getObject).not.toHaveBeenCalled();
  });

  it("rejects a key of a different kind", async () => {
    const importKey = `u/${USER}/import/${crypto.randomUUID()}.png`;
    state.objects.set(importKey, { body: bytes, size: bytes.byteLength });
    expect(
      await resolveChatImageRef(USER, { ...ref, blobKey: importKey }),
    ).toEqual({ kind: "foreign" });
    expect(getObject).not.toHaveBeenCalled();
  });

  it("reports a missing object without throwing", async () => {
    expect(await resolveChatImageRef(USER, ref)).toEqual({ kind: "missing" });
  });

  it("reports an object larger than the chat-image cap", async () => {
    const size = 1024 * 1024 + 1;
    state.objects.set(blobKey, { body: Buffer.alloc(size), size });
    expect(await resolveChatImageRef(USER, ref)).toEqual({ kind: "too_large" });
  });

  it("accepts an object exactly at the cap", async () => {
    const size = 1024 * 1024;
    state.objects.set(blobKey, { body: Buffer.alloc(size), size });
    expect((await resolveChatImageRef(USER, ref)).kind).toBe("ok");
  });
});

describe("chatImagePart", () => {
  it("generates an id when the ref has none", () => {
    const part = chatImagePart({ ...ref, id: "" });
    expect(part.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe("readChatImage", () => {
  it("reads the bytes back by key", async () => {
    state.objects.set(blobKey, { body: bytes, size: bytes.byteLength });
    const read = await readChatImage(blobKey);
    expect(Buffer.isBuffer(read)).toBe(true);
    expect(read).toEqual(bytes);
  });
});
