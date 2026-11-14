import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import type { ReactElement } from "react";
import { db } from "@spektrum/db";
import { users } from "@spektrum/db/schema";
import { requireUser, UnauthorizedError } from "@/auth/session";
import { getProject } from "@/lib/projects";
import {
  getDocumentById,
  getDocumentByPath,
  listTree,
} from "@/lib/documents";
import { EditorClient } from "./editor-client";
import { getLatestRender } from "@/lib/render-store";

export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ p?: string }>;
}): Promise<ReactElement> {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/login");
    throw e;
  }
  const { projectId } = await params;
  const { p } = await searchParams;

  const project = await getProject(user.id, projectId);
  if (!project) notFound();

  const documents = await listTree(user.id, projectId);
  // Initial document: ?p= if it exists, else the main document's path, else
  // the first .tex, else the first document.
  const initialPath =
    (p && documents.some((d) => d.path === p) ? p : undefined) ??
    (project.mainDocumentId
      ? documents.find((d) => d.id === project.mainDocumentId)?.path
      : undefined) ??
    documents.find((d) => d.kind === "tex")?.path ??
    documents[0]?.path ??
    null;

  const initialDocument = initialPath
    ? ((await getDocumentByPath(user.id, projectId, initialPath)) ??
      (await getDocumentById(
        user.id,
        projectId,
        project.mainDocumentId ?? "",
      )))
    : null;

  const initialRender = await getLatestRender(user.id, projectId);
  const mainFilePath =
    documents.find((d) => d.id === project.mainDocumentId)?.path ??
    initialPath ??
    "";

  const [profile] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return (
    <EditorClient
      project={{ id: project.id, name: project.name }}
      documents={documents}
      initialDocument={initialDocument}
      mainFilePath={mainFilePath}
      initialRender={
        initialRender
          ? {
              isCurrent: initialRender.render.isCurrent,
              status: initialRender.render.status,
              revision: initialRender.render.revision,
              pdfUrl: initialRender.render.pdfUrl,
              lastOkRevision: initialRender.render.lastOkRevision,
              mainFile: initialRender.render.mainFile,
              durationMs: initialRender.render.durationMs,
              diagnostics: initialRender.render.diagnostics,
              stats: initialRender.render.stats,
            }
          : null
      }
      user={{ name: profile?.name ?? user.email, email: user.email }}
    />
  );
}