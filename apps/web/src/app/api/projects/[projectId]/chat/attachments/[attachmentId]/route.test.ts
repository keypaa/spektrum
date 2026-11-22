// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { projects, users } from "@spektrum/db/schema";
import type { MessagePart } from "@spektrum/shared/ai";

const state = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; role: string },
  objects: new Map<string, Uint8Array>(),
}));

vi.mock("@/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/session")>();
  return {
    ...actual,
    requireUser: async () => {
      if (!state.user) throw new actual.UnauthorizedError();
      return state.user;
    },
  };
});

vi.mock("@spektrum/storage", () => {
  class StorageError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "StorageError";
    }
  }
  return {
    StorageError,
    putObject: vi.fn(async () => undefined),
    getObject: vi.fn(async (_bucket: string, key: string) => {
      const found = state.objects.get(key);
      if (!found) throw new StorageError("not_found");
      return { body: Buffer.from(found), size: found.byteLength };
    }),
  };
});

import { appendMessage, createThread } from "@/lib/ai/chat-store";
import { GET } from "./route";

const run = Math.random().toString(36).slice(2, 10);
const ownerId = `img-owner-${run}`;
const otherId = `img-other-${run}`;
const projectId = crypto.randomUUID();
const otherProjectId = crypto.randomUUID();
const attachmentId = crypto.randomUUID();
const blobKey = `chat/${projectId}/${attachmentId}.png`;
const imageBytes = Buffer.from("89504e470d0a1a0a", "hex");
let threadId = "";
let otherThreadId = "";

const ctx = (id: string) => ({
  params: Promise.resolve({ projectId, attachmentId: id }),
});
const req = (query = "") =>
  new Request(
    `http://localhost:3000/api/projects/${projectId}/chat/attachments/${attachmentId}${query}`,
  ) as never;

beforeAll(async () => {
  await db.insert(users).values([
    { id: ownerId, email: `img-owner-${run}@test.local`, name: "O" },
    { id: otherId, email: `img-other-${run}@test.local`, name: "T" },
  ]);
  await db.insert(projects).values([
    { id: projectId, ownerId, name: "Images" },
    { id: otherProjectId, ownerId: otherId, name: "Other" },
  ]);
  threadId = (await createThread({ projectId, userId: ownerId, title: "T" })).id;
  otherThreadId = (
    await createThread({ projectId: otherProjectId, userId: otherId, title: "O" })
  ).id;
  const part: MessagePart = {
    type: "image",
    id: attachmentId,
    blobKey,
    name: `${attachmentId}.png`,
    mimeType: "image/png",
  };
  await appendMessage({
    threadId,
    role: "user",
    content: { parts: [part] },
  });
  // The same attachment id in a different user's thread has different bytes.
  await appendMessage({
    threadId: otherThreadId,
    role: "user",
    content: { parts: [{ ...part, blobKey: `chat/${otherProjectId}/${attachmentId}.png` }] },
  });
  state.objects.set(blobKey, imageBytes);
});

beforeEach(() => {
  state.user = { id: ownerId, email: ownerId, role: "owner" };
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, ownerId));
  await db.delete(users).where(eq(users.id, otherId));
  await pool.end();
});

describe("GET chat attachment thumbnail", () => {
  it("serves the bytes with a private cache for the owner", async () => {
    const res = await GET(req(`?threadId=${threadId}`), ctx(attachmentId));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(imageBytes);
  });

  it("returns 404 from the thumbnail route for a non-owner", async () => {
    state.user = { id: otherId, email: otherId, role: "owner" };
    const res = await GET(req(`?threadId=${threadId}`), ctx(attachmentId));
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain(imageBytes.toString("hex"));
  });

  it("returns 404 when the thread, part or blob is missing", async () => {
    expect((await GET(req(), ctx(attachmentId))).status).toBe(404);
    expect(
      (await GET(req(`?threadId=${crypto.randomUUID()}`), ctx(attachmentId))).status,
    ).toBe(404);
    expect(
      (await GET(req(`?threadId=${threadId}`), ctx(crypto.randomUUID()))).status,
    ).toBe(404);

    state.objects.delete(blobKey);
    expect((await GET(req(`?threadId=${threadId}`), ctx(attachmentId))).status).toBe(
      404,
    );
    state.objects.set(blobKey, imageBytes);
  });

  it("returns 404 when the url project does not own the thread", async () => {
    const res = await GET(
      new Request(
        `http://localhost:3000/api/projects/${otherProjectId}/chat/attachments/${attachmentId}?threadId=${threadId}`,
      ) as never,
      {
        params: Promise.resolve({
          projectId: otherProjectId,
          attachmentId,
        }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    state.user = null;
    expect((await GET(req(`?threadId=${threadId}`), ctx(attachmentId))).status).toBe(
      401,
    );
  });
});
