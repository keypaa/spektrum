// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requests: [] as string[],
  existing: null as string | null,
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
    getObject: vi.fn(async (_bucket: string, key: string) => {
      state.requests.push(key);
      if (key === state.existing) {
        return { body: Buffer.from("pdf"), size: 3 };
      }
      throw new StorageError("not_found");
    }),
  };
});

import { getDocumentObject } from "./document-blob";

beforeEach(() => {
  state.requests = [];
  state.existing = null;
});

describe("getDocumentObject", () => {
  it("retries the NFC spelling when a legacy key was stored as NFD", async () => {
    const nfd = "p/Cours 3 - Anthropoce\u0300ne.pdf";
    const nfc = nfd.normalize("NFC");
    state.existing = nfc;

    const object = await getDocumentObject(nfd);

    expect(object.body.toString()).toBe("pdf");
    expect(state.requests).toEqual([nfd, nfc]);
  });

  it("does not retry an ASCII key", async () => {
    state.existing = "p/paper.pdf";

    await getDocumentObject("p/paper.pdf");

    expect(state.requests).toEqual(["p/paper.pdf"]);
  });

  it("rethrows a storage failure that is not a missing key", async () => {
    const { getObject } = await import("@spektrum/storage");
    vi.mocked(getObject).mockRejectedValueOnce(new Error("network down"));

    await expect(getDocumentObject("p/paper.pdf")).rejects.toThrow(
      "network down",
    );
  });
});
