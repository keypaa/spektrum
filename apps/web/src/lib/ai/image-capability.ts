import type { ImageSupportPreference } from "@spektrum/shared/ai";
import type { ImageSupport } from "./model-capabilities";

/** What the composer may do with pasted images, and what to tell the user. */
export type EffectiveImageCapability = {
  canAttach: boolean;
  notice: string | null;
};

export const IMAGE_NOTICE_UNCERTAIN =
  "This model may not accept images. You can still try, or switch model.";
export const IMAGE_NOTICE_DISABLED =
  "Image input is turned off in Settings.";

/**
 * Combine the detected per-model capability with the user's Settings override.
 * This is the only capability check on the client: the chat route validates and
 * forwards images without looking at it (see design §1).
 *
 * `off` refuses to attach. `on` trusts the operator. `auto` never blocks — an
 * explicit `no` or a missing/unknown signal only produces a non-blocking notice.
 */
export function resolveImageCapability(
  detected: ImageSupport | undefined,
  override: ImageSupportPreference,
): EffectiveImageCapability {
  if (override === "off") {
    return { canAttach: false, notice: IMAGE_NOTICE_DISABLED };
  }
  if (override === "on") {
    return { canAttach: true, notice: null };
  }
  return detected === "yes"
    ? { canAttach: true, notice: null }
    : { canAttach: true, notice: IMAGE_NOTICE_UNCERTAIN };
}
