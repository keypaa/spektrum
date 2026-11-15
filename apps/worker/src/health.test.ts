// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { startHealthServer } from "./health";

const servers: Array<ReturnType<typeof startHealthServer>> = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  }
});

describe("worker health server", () => {
  it("answers 200 ok on the configured port", async () => {
    const server = startHealthServer(0);
    servers.push(server);
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    const res = await fetch(`http://127.0.0.1:${address.port}/health`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("survives a port that is already taken instead of crashing", async () => {
    const first = startHealthServer(0);
    servers.push(first);
    const address = first.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    const port = address.port;

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const second = startHealthServer(port);
    servers.push(second);

    await new Promise((resolve) => second.once("error", resolve));
    expect(errors.mock.calls.map((c) => c.join(" ")).join("\n")).toContain(
      "health server error",
    );
    errors.mockRestore();
  });
});