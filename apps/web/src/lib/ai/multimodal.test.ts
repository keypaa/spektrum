// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessagePart } from "@spektrum/shared/ai";

const state = vi.hoisted(() => ({
  images: new Map<string, Buffer>(),
  reads: [] as string[],
}));

vi.mock("./image-attachments", () => ({
  readChatImage: vi.fn(async (blobKey: string) => {
    state.reads.push(blobKey);
    const bytes = state.images.get(blobKey);
    if (!bytes) throw new Error(`no stored image for ${blobKey}`);
    return bytes;
  }),
}));

import { readChatImage } from "./image-attachments";
import {
  buildUserContent,
  IMAGE_OMITTED_MARKER,
  type HistoryTurn,
} from "./multimodal";

type ImagePart = Extract<MessagePart, { type: "image" }>;

const image = (id: string): ImagePart => ({
  type: "image",
  id,
  blobKey: `chat/p/${id}`,
  name: `${id}.png`,
  mimeType: "image/png",
});

const store = (part: ImagePart, size: number): Buffer => {
  const bytes = Buffer.alloc(size, 7);
  state.images.set(part.blobKey, bytes);
  return bytes;
};

const imageUrl = (bytes: Buffer, mimeType = "image/png") => ({
  type: "image_url" as const,
  image_url: { url: `data:${mimeType};base64,${bytes.toString("base64")}` },
});

const turn = (text: string, images: ImagePart[] = []): HistoryTurn => ({
  role: "user",
  text,
  images,
});

beforeEach(() => {
  state.images.clear();
  state.reads.length = 0;
  vi.mocked(readChatImage).mockClear();
});

describe("buildUserContent", () => {
  it("returns a plain string when there are no images", async () => {
    expect(await buildUserContent("hello", [], [])).toBe("hello");
    expect(
      await buildUserContent("hello", [], [turn("earlier", [])]),
    ).toBe("hello");
    expect(readChatImage).not.toHaveBeenCalled();
  });

  it("builds one text part plus image parts for a new message", async () => {
    const a = image("a");
    const b = image("b");
    const aBytes = store(a, 12);
    const bBytes = store(b, 34);

    const content = await buildUserContent("look", [a, b], []);

    expect(content).toEqual([
      { type: "text", text: "look" },
      imageUrl(aBytes),
      imageUrl(bBytes),
    ]);
    expect(JSON.stringify(content)).not.toContain("detail");
  });

  it("includes recent history images on a later turn", async () => {
    const old = image("old");
    const current = image("current");
    const oldBytes = store(old, 12);
    const currentBytes = store(current, 34);

    const content = await buildUserContent("what changed?", [current], [
      turn("first", [old]),
      { role: "assistant", text: "reply", images: [] },
    ]);

    expect(content).toEqual([
      { type: "text", text: "what changed?" },
      imageUrl(currentBytes),
      imageUrl(oldBytes),
    ]);
    expect(content).not.toContainEqual({
      type: "text",
      text: IMAGE_OMITTED_MARKER,
    });
  });

  it("drops oldest images past four, replacing them with [image omitted — re-attach to discuss]", async () => {
    const all = ["a", "b", "c", "d", "e", "f"].map(image);
    const bytes = new Map(all.map((part) => [part.id, store(part, 10)]));
    const [a, b, c, d, e, f] = all;

    const content = await buildUserContent("q", [e!, f!], [
      turn("a", [a!]),
      turn("b", [b!]),
      turn("c", [c!]),
      turn("d", [d!]),
    ]);

    expect(content).toEqual([
      { type: "text", text: "q" },
      imageUrl(bytes.get("e")!),
      imageUrl(bytes.get("f")!),
      imageUrl(bytes.get("d")!),
      imageUrl(bytes.get("c")!),
      { type: "text", text: IMAGE_OMITTED_MARKER },
    ]);
    // Bytes are read only for the four retained images, not the whole history.
    expect(state.reads).toEqual([e!.blobKey, f!.blobKey, d!.blobKey, c!.blobKey]);
  });

  it("drops oldest images past 4 MiB decoded", async () => {
    const oneMiB = 1024 * 1024;
    const all = ["a", "b", "c"].map(image);
    const bytes = new Map(
      all.map((part) => [part.id, store(part, Math.round(oneMiB * 1.5))]),
    );

    const content = await buildUserContent("q", all, []);

    // 1.5 + 1.5 = 3 MiB fits; adding the third would reach 4.5 MiB > 4 MiB.
    expect(content).toEqual([
      { type: "text", text: "q" },
      imageUrl(bytes.get("a")!),
      imageUrl(bytes.get("b")!),
      { type: "text", text: IMAGE_OMITTED_MARKER },
    ]);
  });
});
