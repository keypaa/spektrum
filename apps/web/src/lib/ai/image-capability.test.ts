import { describe, expect, it } from "vitest";
import { resolveImageCapability } from "./image-capability";

describe("resolveImageCapability", () => {
  it("refuses to attach and explains why when the override is off", () => {
    expect(resolveImageCapability("yes", "off")).toEqual({
      canAttach: false,
      notice: "Image input is turned off in Settings.",
    });
  });

  it("enables attaching without a notice when the override is on", () => {
    expect(resolveImageCapability("no", "on")).toEqual({
      canAttach: true,
      notice: null,
    });
  });

  it("enables attaching without a notice when auto detection says yes", () => {
    expect(resolveImageCapability("yes", "auto")).toEqual({
      canAttach: true,
      notice: null,
    });
  });

  it.each(["no", "unknown"] as const)(
    "warns but still allows images when auto detection says %s",
    (detected) => {
      expect(resolveImageCapability(detected, "auto")).toEqual({
        canAttach: true,
        notice: "This model may not accept images. You can still try, or switch model.",
      });
    },
  );

  it("warns when detection is unavailable in auto mode", () => {
    expect(resolveImageCapability(undefined, "auto").notice).toContain(
      "may not accept images",
    );
  });
});
