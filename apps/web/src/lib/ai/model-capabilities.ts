/** Detected image-input capability, independent of the Settings override. */
export type ImageSupport = "yes" | "no" | "unknown";

/**
 * Modalities that mean the model accepts images as input. Providers spell the
 * same capability as `image`, `vision` or `image_url`.
 */
const IMAGE_INPUT_SIGNALS = new Set(["image", "vision", "image_url"]);

/**
 * Flat OpenAI-style ids known to accept images. Used only to turn `unknown`
 * into `yes`; an explicit text-only catalog entry always wins.
 */
const VISION_ID_PATTERNS = [
  /^gpt-4o/,
  /^gpt-4\.1/,
  /^gpt-5/,
  /^gemini-/,
  /^claude-/,
];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Read the first non-empty input-modality list that is present. A list with an
 * image signal is `yes`; a list without one is explicit text-only, so `no`.
 */
function fromModalityList(
  candidates: Array<unknown>,
): ImageSupport | undefined {
  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || candidate.length === 0) continue;
    const modalities = candidate
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim().toLowerCase());
    if (modalities.length === 0) continue;
    return modalities.some((modality) => IMAGE_INPUT_SIGNALS.has(modality))
      ? "yes"
      : "no";
  }
  return undefined;
}

/**
 * `architecture.modality` describes a direction, e.g. `text+image->text`.
 * Only the input side counts: `text->image` is image generation, not input.
 */
function fromModalityString(candidates: Array<unknown>): ImageSupport | undefined {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const input = candidate.toLowerCase().split("->")[0]?.trim() ?? "";
    if (input.length === 0) continue;
    return input.includes("image") || input.includes("vision") ? "yes" : "no";
  }
  return undefined;
}

function fromBooleanFlag(value: unknown): ImageSupport | undefined {
  if (value === true) return "yes";
  if (value === false) return "no";
  return undefined;
}

function fromKnownId(id: string): ImageSupport {
  const flat = id.trim().toLowerCase().split("/").pop() ?? "";
  return VISION_ID_PATTERNS.some((pattern) => pattern.test(flat))
    ? "yes"
    : "unknown";
}

/**
 * Best-effort, three-valued image-input detection from one `/models` entry.
 *
 * Checks the shapes observed across Kilo/OpenRouter, newer OpenAI-compatible
 * gateways and LM Studio, in the design's order. `unknown` is never turned into
 * `no`: only an explicit text-only catalog signal yields `no`.
 */
export function detectImageSupport(
  raw: Record<string, unknown>,
  id: string,
): ImageSupport {
  const architecture = asRecord(raw.architecture);
  const capabilities = asRecord(raw.capabilities);
  const modalities = asRecord(raw.modalities);

  return (
    fromModalityList([
      architecture?.input_modalities,
      raw.input_modalities,
      capabilities?.input_modalities,
      modalities?.input,
    ]) ??
    fromModalityString([architecture?.modality, raw.modality]) ??
    (raw.type === "vlm" ? "yes" : undefined) ??
    fromBooleanFlag(capabilities?.vision) ??
    fromBooleanFlag(raw.supports_vision) ??
    fromBooleanFlag(raw.vision) ??
    fromKnownId(id)
  );
}
