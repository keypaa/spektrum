import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redact";

describe("redactSecrets", () => {
  it("masks sk- keys anywhere in the text", () => {
    expect(redactSecrets('header: sk-live-abcdef123456 done')).toBe(
      "header: sk-*** done",
    );
  });

  it("masks multiple keys", () => {
    expect(
      redactSecrets("sk-abc12345678 and sk-xyz_987654321 here"),
    ).toBe("sk-*** and sk-*** here");
  });

  it("leaves non-key text alone", () => {
    expect(redactSecrets("user logged in from 10.0.0.1")).toBe(
      "user logged in from 10.0.0.1",
    );
    expect(redactSecrets("sk-short")).toBe("sk-short"); // < 8 chars after sk-
  });

  it("masks keys inside JSON blobs", () => {
    const blob = JSON.stringify({ authorization: "Bearer sk-proj-abcdefghijklmnop" });
    expect(redactSecrets(blob)).not.toContain("sk-proj-abcdefghijklmnop");
    expect(redactSecrets(blob)).toContain("sk-***");
  });
});
