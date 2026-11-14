// S3-free seed helpers shared by the compile and AI e2e seeds. `ensureUser` is
// idempotent by email and refreshes the credential password (so a changed
// E2E_*_PASSWORD still signs in); `ensureProject` is idempotent by
// (ownerId, name) and never touches the bucket.

import { and, eq } from "drizzle-orm";
import { db } from "@spektrum/db";
import { accounts, documents, projects, users } from "@spektrum/db/schema";
import { hashPassword } from "../auth/password";

export async function ensureUser(
  email: string,
  password: string,
  name: string,
  role: "owner" | "member",
): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));

  if (existing) {
    const hash = await hashPassword(password);
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.userId, existing.id));
    if (account) {
      await db
        .update(accounts)
        .set({ password: hash })
        .where(eq(accounts.id, account.id));
    } else {
      await db.insert(accounts).values({
        id: crypto.randomUUID(),
        userId: existing.id,
        providerId: "credential",
        accountId: existing.id,
        password: hash,
      });
    }
    await db
      .update(users)
      .set({ name, role, emailVerified: true, banned: false })
      .where(eq(users.id, existing.id));
    return existing.id;
  }

  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email,
    name,
    emailVerified: true,
    role,
    banned: false,
  });
  await db.insert(accounts).values({
    id: crypto.randomUUID(),
    userId: id,
    providerId: "credential",
    accountId: id,
    password: await hashPassword(password),
  });
  return id;
}

export async function ensureProject(input: {
  ownerId: string;
  name: string;
  mainContent: string;
}): Promise<{ id: string; name: string }> {
  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(eq(projects.ownerId, input.ownerId), eq(projects.name, input.name)),
    );

  if (existing) {
    const [main] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(eq(documents.projectId, existing.id), eq(documents.path, "main.tex")),
      );
    if (main) {
      await db
        .update(documents)
        .set({ content: input.mainContent })
        .where(eq(documents.id, main.id));
    }
    return { id: existing.id, name: input.name };
  }

  const [project] = await db
    .insert(projects)
    .values({ ownerId: input.ownerId, name: input.name })
    .returning({ id: projects.id });
  const projectId = project!.id;
  const [main] = await db
    .insert(documents)
    .values({
      projectId,
      path: "main.tex",
      kind: "tex",
      content: input.mainContent,
    })
    .returning({ id: documents.id });
  await db
    .update(projects)
    .set({ mainDocumentId: main!.id })
    .where(eq(projects.id, projectId));
  return { id: projectId, name: input.name };
}