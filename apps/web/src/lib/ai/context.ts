import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@spektrum/db";
import { listContextDocuments } from "@spektrum/db/documents";
import { pdfRenders } from "@spektrum/db/schema";
import type { Diagnostic } from "@spektrum/shared/compile";
import { getProject } from "@/lib/projects";

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

type DropKey = "history" | "bib" | "touched";

type Section = {
  key: string;
  attrs?: string;
  body: string;
  dropKey?: DropKey;
};

const render = (section: Section): string =>
  `<${section.key}${section.attrs ? ` ${section.attrs}` : ""}>\n${section.body}\n</${section.key}>`;

const assemble = (sections: Section[]): string =>
  sections.map(render).join("\n");

export async function buildContext(input: {
  userId: string;
  projectId: string;
  mainFile: string;
  pinnedPaths?: string[];
  touchedPaths?: string[];
  selection?: { path: string; startLine: number; endLine: number };
  history: Array<{ role: "user" | "assistant"; text: string }>;
  limit?: number;
}): Promise<{
  text: string;
  tokens: number;
  dropped: DropKey[];
}> {
  const limit = input.limit ?? 120_000;
  const {
    userId,
    projectId,
    mainFile,
    pinnedPaths = [],
    touchedPaths = [],
    selection,
    history,
  } = input;

  const project = await getProject(userId, projectId);
  if (!project) return { text: "", tokens: 0, dropped: [] };

  const contentPaths = [
    ...new Set([mainFile, ...pinnedPaths, ...touchedPaths, "refs.bib"]),
  ];
  const documents = await listContextDocuments(
    projectId,
    userId,
    contentPaths,
  );
  const byPath = new Map(documents.map((doc) => [doc.path, doc]));
  const bytes = (content: string): number =>
    new TextEncoder().encode(content).length;

  const manifest = documents
    .map((doc) => {
      if (doc.content === null) {
        return `- ${doc.path} (${doc.kind}, null)`;
      }
      return `- ${doc.path} (${doc.kind}, ${bytes(doc.content)} bytes, ${doc.content.split("\n").length} lines)`;
    })
    .join("\n");

  const main = byPath.get(mainFile)?.content ?? "";

  const filePaths = [
    ...new Set([...touchedPaths, ...pinnedPaths]),
  ].filter((path) => path !== mainFile);
  const fileSections: Section[] = filePaths.flatMap((path) => {
    const content = byPath.get(path)?.content;
    if (content === null || content === undefined) return [];
    return [{ key: "files", attrs: `path="${path}"`, body: content }];
  });
  for (const section of fileSections) section.dropKey = "touched";

  const bib = byPath.get("refs.bib")?.content ?? "";
  const bibKeys = [...bib.matchAll(/@\w+\s*\{\s*([^,\s]+)/g)].map(
    (match) => match[1]!,
  );

  const selectionContent = selection
    ? byPath.get(selection.path)?.content
    : null;
  const selectionBody =
    selection && selectionContent !== null && selectionContent !== undefined
      ? selectionContent
          .split("\n")
          .slice(selection.startLine - 1, selection.endLine)
          .join("\n")
      : "";

  const [renderRow] = await db
    .select({ diagnostics: pdfRenders.diagnostics })
    .from(pdfRenders)
    .where(
      and(
        eq(pdfRenders.projectId, projectId),
        inArray(pdfRenders.status, ["ok", "error"]),
      ),
    )
    .orderBy(desc(pdfRenders.createdAt))
    .limit(1);
  const diagnostics = ((renderRow?.diagnostics ?? []) as Diagnostic[]).slice(
    -10,
  );
  const diagnosticsBody = diagnostics
    .map(
      (diagnostic) =>
        `${diagnostic.file ?? "?"}:${(diagnostic.line ?? 0) + 1}: ${diagnostic.message}`,
    )
    .join("\n");

  const historyBody = history
    .slice(-20)
    .map(
      (turn) =>
        `${turn.role === "user" ? "User" : "Assistant"}: ${turn.text}`,
    )
    .join("\n");

  const sections: Section[] = [
    { key: "manifest", body: manifest },
    { key: "main", attrs: `path="${mainFile}"`, body: main },
    ...fileSections,
    { key: "bib_keys", body: bibKeys.join(", "), dropKey: "bib" },
    ...(selection
      ? [
          {
            key: "selection",
            attrs: `path="${selection.path}" lines="${selection.startLine}-${selection.endLine}"`,
            body: selectionBody,
          },
        ]
      : []),
    { key: "diagnostics", body: diagnosticsBody },
    { key: "history", body: historyBody, dropKey: "history" },
  ];

  let text = assemble(sections);
  const dropped: DropKey[] = [];

  for (const key of ["history", "bib", "touched"] as const) {
    if (estimateTokens(text) <= limit) break;
    const index = sections.findIndex((section) => section.dropKey === key);
    if (index === -1) continue;
    const [removed] = sections.splice(index, 1);
    if (removed) dropped.push(key);
    text = assemble(sections);
  }

  if (estimateTokens(text) > limit) {
    const mainIndex = sections.findIndex((section) => section.key === "main");
    if (mainIndex !== -1) {
      const current = sections[mainIndex]!;
      let body = current.body;
      const withMarker = (candidate: string): string =>
        candidate.length < current.body.length
          ? `${candidate}\n… [truncated]`
          : candidate;
      const fits = (candidate: string): boolean =>
        estimateTokens(
          assemble(
            sections.map((section, index) =>
              index === mainIndex
                ? { ...section, body: withMarker(candidate) }
                : section,
            ),
          ),
        ) <= limit;
      while (body.length > 0 && !fits(body)) {
        body = body.slice(0, Math.max(0, body.length - 100));
      }
      sections[mainIndex] = { ...current, body: withMarker(body) };
      text = assemble(sections);
    }
  }

  return { text, tokens: estimateTokens(text), dropped };
}