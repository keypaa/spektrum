import { describe, expect, it } from "vitest";

import { detectImageSupport } from "./model-capabilities";

describe("detectImageSupport", () => {
  it("detects image from architecture.input_modalities", () => {
    expect(
      detectImageSupport(
        {
          id: "anthropic/claude-opus-5.5",
          architecture: { input_modalities: ["text", "image"] },
        },
        "anthropic/claude-opus-5.5",
      ),
    ).toBe("yes");
  });

  it("detects image from architecture.modality 'text+image->text'", () => {
    expect(
      detectImageSupport(
        { id: "google/gemini-4-neon", architecture: { modality: "text+image->text" } },
        "google/gemini-4-neon",
      ),
    ).toBe("yes");
  });

  it("detects type 'vlm'", () => {
    expect(
      detectImageSupport({ id: "local-vlm", type: "vlm" }, "local-vlm"),
    ).toBe("yes");
  });

  it("returns yes for a known OpenAI vision id with no metadata", () => {
    expect(
      detectImageSupport({ id: "gpt-4o", object: "model", owned_by: "openai" }, "gpt-4o"),
    ).toBe("yes");
  });

  it("returns no when the catalog explicitly lists only text", () => {
    expect(
      detectImageSupport(
        {
          id: "baidu/ernie-5.5-flash-preview:free",
          architecture: { input_modalities: ["text"], modality: "text->text" },
        },
        "baidu/ernie-5.5-flash-preview:free",
      ),
    ).toBe("no");
  });

  it("returns unknown for an unrecognised custom model", () => {
    expect(
      detectImageSupport({ id: "acme-custom-1", object: "model" }, "acme-custom-1"),
    ).toBe("unknown");
    expect(detectImageSupport({}, "another-custom-model")).toBe("unknown");
  });

  it("reads the other observed input-modality shapes", () => {
    const shapes: Array<Record<string, unknown>> = [
      { input_modalities: ["text", "image"] },
      { capabilities: { input_modalities: ["vision"] } },
      { modalities: { input: ["text", "image_url"] } },
    ];
    for (const raw of shapes) {
      expect(detectImageSupport({ id: "shape", ...raw }, "shape")).toBe("yes");
    }
  });

  it("reads boolean vision capability flags", () => {
    expect(
      detectImageSupport({ capabilities: { vision: true } }, "flagged-1"),
    ).toBe("yes");
    expect(detectImageSupport({ supports_vision: true }, "flagged-2")).toBe("yes");
    expect(detectImageSupport({ vision: true }, "flagged-3")).toBe("yes");
    expect(detectImageSupport({ capabilities: { vision: false } }, "flagged-4")).toBe(
      "no",
    );
  });

  it("does not treat an image-output modality as image input", () => {
    expect(
      detectImageSupport({ architecture: { modality: "text->image" } }, "painter-1"),
    ).toBe("no");
  });

  it("lets explicit catalog metadata beat the static allowlist", () => {
    expect(
      detectImageSupport(
        { id: "gpt-4o", architecture: { input_modalities: ["text"] } },
        "gpt-4o",
      ),
    ).toBe("no");
  });
});
