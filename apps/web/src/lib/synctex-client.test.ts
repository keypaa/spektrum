// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSyncTex } from "./synctex-client";

afterEach(() => vi.unstubAllGlobals());

describe("fetchSyncTex", () => {
  it("fetches a signed URL for the synctex key, then reads the map", async () => {
    const revision = "a".repeat(64);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/synctex/url")) {
        return new Response(
          JSON.stringify({ url: "https://r2.example/signed-synctex" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url === "https://r2.example/signed-synctex") {
        return new Response(
          JSON.stringify({ forward: {}, backward: [] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const map = await fetchSyncTex("p1", revision);

    expect(map).toEqual({ forward: {}, backward: [] });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `/api/projects/p1/render/${revision}/synctex/url`,
    );
    expect(fetchMock.mock.calls[1]![0]).toBe("https://r2.example/signed-synctex");
  });

  it("returns null when there is no signed URL or the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    expect(await fetchSyncTex("p1", "a".repeat(64))).toBeNull();
  });
});
