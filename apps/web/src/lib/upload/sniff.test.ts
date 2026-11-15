// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertZipMagic, contentTypeOf, sniffContentType, SniffError } from "./sniff";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe("sniffContentType", () => {
  it("detects zip, png, jpeg and pdf", () => {
    expect(sniffContentType(bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00))).toBe("application/zip");
    expect(sniffContentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffContentType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffContentType(ascii("%PDF-1.7\n"))).toBe("application/pdf");
  });

  it("rejects markup and plain text", () => {
    expect(sniffContentType(ascii("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffContentType(ascii("\\documentclass{article}"))).toBeNull();
    expect(sniffContentType(new Uint8Array(0))).toBeNull();
  });

  it("falls back to octet-stream", () => {
    expect(contentTypeOf(ascii("<svg/>"))).toBe("application/octet-stream");
  });
});

describe("assertZipMagic", () => {
  it("accepts a zip and rejects anything else", () => {
    expect(() => assertZipMagic(bytes(0x50, 0x4b, 0x03, 0x04))).not.toThrow();
    expect(() => assertZipMagic(ascii("PK\u0003\u0004"))).not.toThrow();
    expect(() => assertZipMagic(ascii("<html>"))).toThrow(SniffError);
  });
});