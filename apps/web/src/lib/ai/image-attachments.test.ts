// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  objects: new Map<string, { body: Uint8Array; contentType: string }>(),
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
    putObject: vi.fn(
      async (
        bucket: string,
        key: string,
        body: Uint8Array,
        contentType: string,
      ) => {
        state.objects.set(`${bucket}/${key}`, { body, contentType });
      },
    ),
    getObject: vi.fn(async (bucket: string, key: string) => {
      const found = state.objects.get(`${bucket}/${key}`);
      if (!found) throw new StorageError("not_found");
      return { body: Buffer.from(found.body), size: found.body.byteLength };
    }),
  };
});

import { putObject } from "@spektrum/storage";
import { storeChatImage, readChatImage } from "./image-attachments";

const PROJECT_ID = crypto.randomUUID();
const bytes = Buffer.from("89504e470d0a1a0a", "hex");
const attachment = {
  id: crypto.randomUUID(),
  mimeType: "image/png" as const,
  data: bytes.toString("base64"),
};

beforeEach(() => {
  state.objects.clear();
  vi.mocked(putObject).mockClear();
});

describe("chat image attachments", () => {
  it("stores an attachment under chat/<projectId>/<uuid>", async () => {
    const { blobKey, part } = await storeChatImage(
      "user-1",
      PROJECT_ID,
      attachment,
    );

    expect(blobKey).toMatch(
      new RegExp(`^chat/${PROJECT_ID}/[0-9a-f-]+\\.png$`),
    );
    expect(putObject).toHaveBeenCalledWith(
      "uploads",
      blobKey,
      expect.any(Uint8Array),
      "image/png",
    );
    expect(Buffer.from(vi.mocked(putObject).mock.calls[0]![2] as Uint8Array)).toEqual(
      bytes,
    );
    // The part id is generated here, never taken from the client attachment.
    expect(part.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(part.id).not.toBe(attachment.id);
    expect(part).toEqual({
      type: "image",
      id: part.id,
      blobKey,
      name: `${attachment.id}.png`,
      mimeType: "image/png",
    });
  });

  it("generates distinct ids for duplicate client attachment ids", async () => {
    const first = await storeChatImage("user-1", PROJECT_ID, attachment);
    const second = await storeChatImage("user-1", PROJECT_ID, attachment);

    expect(first.part.id).not.toBe(second.part.id);
    expect(first.blobKey).not.toBe(second.blobKey);
  });

  it("reads the bytes back", async () => {
    const { blobKey } = await storeChatImage("user-1", PROJECT_ID, attachment);

    const read = await readChatImage(blobKey);

    expect(Buffer.isBuffer(read)).toBe(true);
    expect(read).toEqual(bytes);
  });
});
