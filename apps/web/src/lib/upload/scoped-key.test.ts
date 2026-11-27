import { describe, expect, it } from "vitest";
import { assertScopedKey, scopedKey, UPLOAD_KINDS } from "./scoped-key";

describe("scoped upload keys", () => {
  it("uses the u/<user>/<kind>/<uuid>.<ext> format", () => {
    expect(scopedKey("u1", "chat-image", "webp")).toMatch(
      /^u\/u1\/chat-image\/[0-9a-f-]{36}\.webp$/,
    );
    expect(UPLOAD_KINDS).toEqual([
      "import",
      "workspace",
      "chat-image",
      "render",
    ]);
  });

  it("accepts a key only for its own user", () => {
    const key = scopedKey("u2", "chat-image", "webp");
    expect(assertScopedKey("u2", "chat-image", key)).toBe(true);
    expect(assertScopedKey("u1", "chat-image", key)).toBe(false);
  });

  it("accepts a key only for its own kind", () => {
    const key = scopedKey("u1", "chat-image", "webp");
    expect(assertScopedKey("u1", "chat-image", key)).toBe(true);
    expect(assertScopedKey("u1", "import", key)).toBe(false);
  });

  it("rejects malformed keys", () => {
    expect(
      assertScopedKey("u1", "chat-image", "u/u1/chat-image/not-a-uuid.webp"),
    ).toBe(false);
    expect(
      assertScopedKey(
        "u1",
        "chat-image",
        "u/u1/chat-image/123e4567-e89b-12d3-a456-426614174000",
      ),
    ).toBe(false);
    expect(
      assertScopedKey(
        "u1",
        "chat-image",
        "u/u1/chat-image/123e4567-e89b-12d3-a456-426614174000.webp/extra",
      ),
    ).toBe(false);
  });

  it("does not let a user id escape its prefix", () => {
    const key = scopedKey("u1", "import", "zip");
    expect(assertScopedKey("u1/../u2", "import", key)).toBe(false);
  });
});
