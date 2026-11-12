"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireUser } from "@/auth/session";
import {
  createFolder,
  createProject,
  duplicateProject,
  projectName,
  renameProject,
  softDeleteProject,
} from "./projects";

export async function createBlankProject(): Promise<void> {
  const user = await requireUser();
  await createProject(user.id, "New Project", "blank");
  revalidatePath("/");
}

export async function createExampleProject(): Promise<void> {
  const user = await requireUser();
  await createProject(user.id, "New Project", "example");
  revalidatePath("/");
}

export async function createFolderAction(name: string): Promise<void> {
  const user = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return;
  await createFolder(user.id, trimmed);
  revalidatePath("/");
}

export async function renameProjectAction(id: string, name: string): Promise<void> {
  const user = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return;
  await renameProject(user.id, id, trimmed);
  revalidatePath("/");
}

export async function duplicateProjectAction(id: string): Promise<void> {
  const user = await requireUser();
  const name = `Copy of ${await projectName(user.id, id)}`;
  await duplicateProject(user.id, id, name);
  revalidatePath("/");
}

export async function deleteProjectAction(id: string): Promise<void> {
  const user = await requireUser();
  await softDeleteProject(user.id, id);
  revalidatePath("/");
}

// Sign-out is NOT a server action: better-auth has no `nextCookies()` plugin
// here, so `auth.api.signOut` cannot clear the browser cookie. The account
// menu calls `authClient.signOut()` and then navigates to /login (Task 15).
export async function setThemePreferenceAction(pref: string): Promise<void> {
  (await cookies()).set("crixet_light_mode_preference_v1", pref, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
