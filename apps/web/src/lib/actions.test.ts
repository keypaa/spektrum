import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { accounts, folders, projects, users } from "@spektrum/db/schema";
import { auth } from "@/auth/auth";
import { hashPassword } from "@/auth/password";
import { UnauthorizedError } from "@/auth/session";

// The actions call requireUser(), which reads next/headers, and
// setThemePreferenceAction() writes through cookies(). Mock both against a
// real signed-in session created through auth.handler (same pattern as the
// llm-key route test).
const state = vi.hoisted(() => ({
  authenticated: false,
  sessionCookie: "",
  jar: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(
      state.authenticated && state.sessionCookie ? { cookie: state.sessionCookie } : {},
    ),
  cookies: async () => ({
    get: (name: string) => {
      const value = state.jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      state.jar.set(name, value);
    },
    delete: (name: string) => {
      state.jar.delete(name);
    },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { cookies } from "next/headers";
import {
  createBlankProject,
  createExampleProject,
  createFolderAction,
  deleteProjectAction,
  duplicateProjectAction,
  renameProjectAction,
  setThemePreferenceAction,
} from "./actions";

const run = Math.random().toString(36).slice(2, 10);
const userId = `actions-${run}`;
const email = `actions-${run}@test.local`;
const password = "actions test password";
const otherUserId = `actions-other-${run}`;
const otherEmail = `actions-other-${run}@test.local`;
const ip = `10.56.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function makeUser(id: string, address: string): Promise<void> {
  await db.delete(users).where(eq(users.id, id));
  await db.insert(users).values({
    id,
    email: address,
    name: "Actions Test",
    emailVerified: true,
  });
  await db.insert(accounts).values({
    id: `acct-${id}`,
    userId: id,
    providerId: "credential",
    accountId: id,
    password: await hashPassword(password),
  });
}

async function insertProject(ownerId: string, name: string): Promise<string> {
  const [row] = await db
    .insert(projects)
    .values({ ownerId, name })
    .returning({ id: projects.id });
  return row!.id;
}

async function projectRow(id: string) {
  const [row] = await db.select().from(projects).where(eq(projects.id, id));
  return row!;
}

beforeAll(async () => {
  await makeUser(userId, email);
  await makeUser(otherUserId, otherEmail);

  const signIn = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ email, password }),
    }),
  );
  expect(signIn.status).toBe(200);
  state.sessionCookie = signIn.headers.get("set-cookie")!.split(";")[0]!;
  state.authenticated = true;
});

beforeEach(async () => {
  state.jar.clear();
  // Every test starts from a clean slate for the signed-in owner.
  await db.delete(projects).where(eq(projects.ownerId, userId));
  await db.delete(folders).where(eq(folders.ownerId, userId));
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, otherUserId));
  await pool.end();
});

describe("actions without a session", () => {
  it("rejects every database action", async () => {
    state.authenticated = false;
    try {
      await expect(createBlankProject()).rejects.toBeInstanceOf(UnauthorizedError);
      await expect(createExampleProject()).rejects.toBeInstanceOf(UnauthorizedError);
      await expect(createFolderAction("Folder")).rejects.toBeInstanceOf(UnauthorizedError);
      await expect(renameProjectAction("some-id", "Name")).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
      await expect(duplicateProjectAction("some-id")).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
      await expect(deleteProjectAction("some-id")).rejects.toBeInstanceOf(UnauthorizedError);
    } finally {
      state.authenticated = true;
    }
  });
});

describe("project creation actions", () => {
  it("createBlankProject inserts a project named New Project", async () => {
    await createBlankProject();

    const rows = await db.select().from(projects).where(eq(projects.ownerId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("New Project");
    expect(rows[0]!.deletedAt).toBeNull();
  });

  it("createExampleProject inserts a project named New Project", async () => {
    await createExampleProject();

    const rows = await db.select().from(projects).where(eq(projects.ownerId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("New Project");
  });

  it("createFolderAction trims the name and inserts a folder", async () => {
    await createFolderAction("  Folder  ");

    const rows = await db.select().from(folders).where(eq(folders.ownerId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Folder");
  });
});

describe("renameProjectAction", () => {
  it("trims and updates the project name", async () => {
    const id = await insertProject(userId, "Old Name");

    await renameProjectAction(id, "  Renamed  ");

    expect((await projectRow(id)).name).toBe("Renamed");
  });

  it("is a no-op for a project owned by someone else", async () => {
    const id = await insertProject(otherUserId, "Victim");

    await renameProjectAction(id, "Hacked");

    expect((await projectRow(id)).name).toBe("Victim");
  });
});

describe("duplicateProjectAction", () => {
  it("creates a copy named Copy of <source>", async () => {
    const id = await insertProject(userId, "Original");

    await duplicateProjectAction(id);

    const rows = await db.select().from(projects).where(eq(projects.ownerId, userId));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.name).sort()).toEqual(["Copy of Original", "Original"]);
  });
});

describe("deleteProjectAction", () => {
  it("soft-deletes the project", async () => {
    const id = await insertProject(userId, "Doomed");

    await deleteProjectAction(id);

    expect((await projectRow(id)).deletedAt).toBeInstanceOf(Date);
  });

  it("is a no-op for a project owned by someone else", async () => {
    const id = await insertProject(otherUserId, "Victim");

    await deleteProjectAction(id);

    expect((await projectRow(id)).deletedAt).toBeNull();
  });
});

describe("setThemePreferenceAction", () => {
  it("sets the theme preference cookie", async () => {
    await setThemePreferenceAction("light");

    expect((await cookies()).get("crixet_light_mode_preference_v1")?.value).toBe("light");
  });
});
