import { describe, expect, it } from "vitest";
import {
  IMAGE_LIMITS,
  chatImageAttachmentSchema,
  chatImageAttachmentsSchema,
  chatImageRefsSchema,
  imageSupportSchema,
} from "./images";

const pngData = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]).toString("base64");

function attachment(overrides: Record<string, unknown> = {}) {
  return { id: "a1", mimeType: "image/png", data: pngData, ...overrides };
}

describe("IMAGE_LIMITS", () => {
  it("pins the agreed caps", () => {
    expect(IMAGE_LIMITS).toEqual({
      maxCount: 4,
      maxBytesPerImage: 1024 * 1024,
      maxHistoryBytes: 4 * 1024 * 1024,
      maxEdge: 1536,
    });
  });
});

describe("chatImageAttachmentsSchema", () => {
  it("accepts four small PNG attachments", () => {
    const images = Array.from({ length: 4 }, (_, i) =>
      attachment({ id: `a${i}` }),
    );
    expect(chatImageAttachmentsSchema.parse(images)).toHaveLength(4);
  });

  it("rejects a fifth attachment", () => {
    const images = Array.from({ length: 5 }, (_, i) =>
      attachment({ id: `a${i}` }),
    );
    expect(chatImageAttachmentsSchema.safeParse(images).success).toBe(false);
  });

  it("rejects base64 that decodes over 1 MiB", () => {
    const data = Buffer.alloc(IMAGE_LIMITS.maxBytesPerImage + 1).toString(
      "base64",
    );
    expect(
      chatImageAttachmentSchema.safeParse(attachment({ data })).success,
    ).toBe(false);
  });

  it("rejects image/bmp", () => {
    expect(
      chatImageAttachmentSchema.safeParse(
        attachment({ mimeType: "image/bmp" }),
      ).success,
    ).toBe(false);
  });

  it("accepts exactly 1 MiB and every allowed MIME type", () => {
    const data = Buffer.alloc(IMAGE_LIMITS.maxBytesPerImage).toString("base64");
    for (const mimeType of [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
    ]) {
      expect(
        chatImageAttachmentSchema.safeParse(attachment({ mimeType, data }))
          .success,
      ).toBe(true);
    }
  });

  it("rejects non-base64 input and junk Buffer silently ignores", () => {
    for (const data of [
      "data:image/png;base64,iVBORw0KGgo=",
      "iVBORw0KGgo=!!",
      "iVBOR w0KGgo=",
      "not base64 at all",
      "abc", // not a multiple of four
    ]) {
      expect(
        chatImageAttachmentSchema.safeParse(attachment({ data })).success,
      ).toBe(false);
    }
  });

  it("rejects a raw string too long to be a valid 1 MiB payload", () => {
    const data = "A".repeat(2_000_000);
    expect(
      chatImageAttachmentSchema.safeParse(attachment({ data })).success,
    ).toBe(false);
  });
});

describe("chatImageRefsSchema", () => {
  const ref = (overrides: Record<string, unknown> = {}) => ({
    id: crypto.randomUUID(),
    blobKey: `u/u1/chat-image/${crypto.randomUUID()}.png`,
    mimeType: "image/png",
    name: "shot.png",
    ...overrides,
  });

  it("accepts up to four uploaded blob keys", () => {
    expect(
      chatImageRefsSchema.parse(Array.from({ length: 4 }, () => ref())),
    ).toHaveLength(4);
  });

  it("rejects a fifth image", () => {
    expect(
      chatImageRefsSchema.safeParse(Array.from({ length: 5 }, () => ref()))
        .success,
    ).toBe(false);
  });

  it("requires all four fields and an allowed MIME type", () => {
    expect(chatImageRefsSchema.safeParse([ref({ blobKey: undefined })]).success).toBe(
      false,
    );
    expect(chatImageRefsSchema.safeParse([ref({ name: undefined })]).success).toBe(
      false,
    );
    expect(chatImageRefsSchema.safeParse([ref({ mimeType: "image/bmp" })]).success).toBe(
      false,
    );
  });
});

describe("imageSupportSchema", () => {
  it("accepts auto, on and off only", () => {
    expect(imageSupportSchema.parse("auto")).toBe("auto");
    expect(imageSupportSchema.parse("on")).toBe("on");
    expect(imageSupportSchema.parse("off")).toBe("off");
    expect(imageSupportSchema.safeParse("maybe").success).toBe(false);
  });
});
