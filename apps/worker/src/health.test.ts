// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
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
});