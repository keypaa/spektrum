// Pure Prism-archive parser (spec §13.2). No DB, no I/O: `readZip` produces
// `ZipEntry[]`, this turns them into projects, and `import-archive.ts` writes
// them. Keeping it pure means every path-traversal, junk-entry and re-root
// rule is unit-testable without a database.
import { normalizeDocumentPath } from "@spektrum/shared/paths";
import type { ZipEntry } from "./zip";

export type ParsedFileKind = "tex" | "bib" | "img" | "csv" | "other";

export type ParsedFile = {
  path: string;
  kind: ParsedFileKind;
  bytes: Uint8Array;
  text: string | null;
};

export type ParsedTurn = { role: "user" | "assistant" | "tool"; text: string };

export type ParsedConversation = {
  id: string;
  title: string;
  turns: ParsedTurn[];
  skipped: boolean;
  reason?: string;
};

export type ParsedProject = {
  name: string;
  files: ParsedFile[];
  mainPath: string | null;
  promotedMain: boolean;
  conversations: ParsedConversation[];
  rewrites: Array<{ from: string; to: string }>;
  rejectedPaths: string[];
};

export type ParsedArchive = {
  projects: ParsedProject[];
  rejectedPaths: string[];
};

export type ParseLimits = { maxProjects?: number; maxFileBytes?: number };

const DEFAULT_MAX_PROJECTS = 200;
const DEFAULT_MAX_FILE_BYTES = 26_214_400;

/** Extensions Prism uses, mapped to our `document_kind`. */
const KIND_BY_EXT: Record<string, ParsedFileKind> = {
  tex: "tex",
  cls: "tex",
  sty: "tex",
  bib: "bib",
  csv: "csv",
  png: "img",
  jpg: "img",
  jpeg: "img",
  gif: "img",
  webp: "img",
  svg: "img",
  pdf: "img",
};

function kindForPath(path: string): ParsedFileKind {
  const dot = path.lastIndexOf(".");
  if (dot <= 0 || dot === path.length - 1) return "other";
  return KIND_BY_EXT[path.slice(dot + 1).toLowerCase()] ?? "other";
}

/** Validate an entry path with the one implementation the app and worker share
 *  (`normalizeDocumentPath`), so the importer cannot drift from the editor's
 *  rules. Returns the normalised path (duplicate separators collapsed) or null
 *  when the entry must be rejected. */
function normalizeEntryPath(path: string): string | null {
  try {
    return normalizeDocumentPath(path);
  } catch {
    return null;
  }
}

/** Silently dropped packaging noise, not a security finding. */
function isJunkPath(path: string): boolean {
  const segments = path.split("/");
  if (segments[0] === "__MACOSX") return true;
  const base = segments[segments.length - 1] ?? "";
  if (base === ".DS_Store") return true;
  return path.endsWith("/spektrum-export.json");
}

const INCLUDEGRAPHICS =
  /(includegraphics(?:\s*\[[^\]]*\])?\s*\{)\s*\/?(?:uploads|prism-uploads)\/([^}]+)\}/g;

function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  return new TextDecoder("utf-8").decode(bytes);
}

function rewriteIncludes(
  path: string,
  text: string,
): { text: string; rewrites: Array<{ from: string; to: string }> } {
  if (path.toLowerCase().endsWith(".tex") === false) return { text, rewrites: [] };
  const rewrites: Array<{ from: string; to: string }> = [];
  const rewritten = text.replace(INCLUDEGRAPHICS, (match, head: string, name: string) => {
    const to = `${head}${name}}`;
    rewrites.push({ from: match, to });
    return to;
  });
  return { text: rewritten, rewrites };
}

function firstUserText(turns: ParsedTurn[]): string {
  return turns.find((t) => t.role === "user")?.text ?? "";
}

function titleFrom(turns: ParsedTurn[]): string {
  const text = firstUserText(turns).replace(/\s+/g, " ").trim();
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

type RawItem = {
  type?: unknown;
  role?: unknown;
  name?: unknown;
  arguments?: unknown;
  output?: unknown;
  operation?: unknown;
  content?: unknown;
  status?: unknown;
};

function contentText(content: unknown): { role: "user" | "assistant" | null; text: string } {
  if (!Array.isArray(content)) return { role: null, text: "" };
  const parts: string[] = [];
  let role: "user" | "assistant" | null = null;
  for (const part of content) {
    if (typeof part !== "object" || part === null) continue;
    const p = part as { type?: unknown; text?: unknown };
    if (p.type === "input_text" && typeof p.text === "string") {
      role = role ?? "user";
      parts.push(p.text);
    } else if (p.type === "output_text" && typeof p.text === "string") {
      role = role ?? "assistant";
      parts.push(p.text);
    }
  }
  return { role, text: parts.join("") };
}

function itemToTurn(item: RawItem): ParsedTurn | null {
  const type = typeof item.type === "string" ? item.type : "";
  if (type === "message") {
    const { role, text } = contentText(item.content);
    if (!role || text === "") return null;
    return { role, text };
  }
  if (type === "function_call") {
    const name = typeof item.name === "string" ? item.name : "tool";
    const args = typeof item.arguments === "string" ? item.arguments : "";
    return { role: "tool", text: `${name}(${args})` };
  }
  if (type === "function_call_output") {
    const out = typeof item.output === "string" ? item.output : "";
    return { role: "tool", text: `result: ${out}` };
  }
  if (type === "apply_patch_call") {
    const op = (item.operation ?? {}) as { type?: unknown; path?: unknown };
    const kind = typeof op.type === "string" ? op.type : "update_file";
    const path = typeof op.path === "string" ? ` ${op.path}` : "";
    return { role: "tool", text: `apply_patch ${kind}${path}` };
  }
  if (type === "apply_patch_call_output") {
    const out = typeof item.output === "string" ? item.output : "";
    return { role: "tool", text: `result: ${out}` };
  }
  return null;
}

function parseConversation(id: string, json: unknown): ParsedConversation {
  const empty: ParsedConversation = { id, title: "", turns: [], skipped: false };
  if (typeof json !== "object" || json === null) {
    return { ...empty, skipped: true, reason: "conversation file is not an object" };
  }
  const record = json as {
    status?: unknown;
    reason?: unknown;
    items?: unknown;
    conversation?: unknown;
    conversation_id?: unknown;
  };

  const turns: ParsedTurn[] = [];
  if (Array.isArray(record.items)) {
    for (const item of record.items) {
      if (typeof item !== "object" || item === null) continue;
      const turn = itemToTurn(item as RawItem);
      if (turn) turns.push(turn);
    }
  }

  if (record.status === "unsupported") {
    const reason =
      typeof record.reason === "string" ? record.reason : "unsupported by the export";
    return { id, title: titleFrom(turns), turns: [], skipped: true, reason };
  }

  const conversationId =
    (typeof record.conversation_id === "string" && record.conversation_id) ||
    (typeof (record.conversation as { id?: unknown } | undefined)?.id === "string"
      ? ((record.conversation as { id: string }).id)
      : id);

  return {
    id: conversationId || id,
    title: titleFrom(turns),
    turns,
    skipped: false,
  };
}

type Bucket = {
  name: string;
  files: ParsedFile[];
  conversations: ParsedConversation[];
};

export function parsePrismArchive(
  entries: ZipEntry[],
  limits: ParseLimits = {},
): ParsedArchive {
  const maxProjects = limits.maxProjects ?? DEFAULT_MAX_PROJECTS;
  const maxFileBytes = limits.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;

  const buckets = new Map<string, Bucket>();
  const rejected: string[] = [];

  for (const entry of entries) {
    const path = entry.path;
    if (path.endsWith("/")) continue; // directory entry
    if (isJunkPath(path)) continue;
    const normalised = normalizeEntryPath(path);
    if (normalised === null) {
      // Validate before grouping: a traversal path has no valid first segment,
      // so a "stray root file" reading would silently ignore an attack.
      rejected.push(path);
      continue;
    }
    const slash = normalised.indexOf("/");
    if (slash <= 0) continue; // stray root file
    const name = normalised.slice(0, slash);
    let bucket = buckets.get(name);
    if (!bucket) {
      bucket = { name, files: [], conversations: [] };
      buckets.set(name, bucket);
    }

    const relative = normalised.slice(slash + 1);
    if (relative.startsWith("preview/")) continue;

    if (relative.startsWith("conversations/") && relative.endsWith(".json")) {
      const file = relative.slice("conversations/".length);
      if (file.includes("/")) continue;
      let json: unknown;
      try {
        json = JSON.parse(new TextDecoder().decode(entry.data));
      } catch {
        rejected.push(path);
        continue;
      }
      bucket.conversations.push(
        parseConversation(file.replace(/\.json$/, ""), json),
      );
      continue;
    }

    if (entry.data.byteLength > maxFileBytes) {
      rejected.push(path);
      continue;
    }

    const kind = kindForPath(relative);
    const text = kind === "img" ? null : decodeText(entry.data);
    bucket.files.push({
      path: relative,
      kind,
      bytes: entry.data,
      text,
    });
  }

  const projects: ParsedProject[] = [];
  const aggregate: string[] = [];
  for (const bucket of buckets.values()) {
    if (projects.length >= maxProjects) break;
    const project = finalizeProject(bucket);
    aggregate.push(...project.rejectedPaths);
    if (project.files.length > 0 || project.conversations.length > 0) {
      projects.push(project);
    }
  }

  return { projects, rejectedPaths: [...rejected, ...aggregate] };
}

/** Re-root uploads, resolve the main file and apply include rewrites. */
function finalizeProject(bucket: Bucket): ParsedProject {
  // Files not under an upload directory are placed first so a root-level name
  // always wins the collision; upload files fall back to their prefix.
  const roots: ParsedFile[] = [];
  const uploads: ParsedFile[] = [];
  for (const file of bucket.files) {
    if (file.path.startsWith("uploads/") || file.path.startsWith("prism-uploads/")) {
      uploads.push(file);
    } else {
      roots.push(file);
    }
  }

  const taken = new Set<string>();
  const files: ParsedFile[] = [];
  const rewrites: Array<{ from: string; to: string }> = [];

  for (const file of [...roots, ...uploads]) {
    let path = file.path;
    const isUpload =
      path.startsWith("uploads/") || path.startsWith("prism-uploads/");
    if (isUpload) {
      const bare = path.slice(path.indexOf("/") + 1);
      // A root-level file already owns the bare name, so the upload keeps its
      // prefixed path instead of clobbering it.
      if (bare !== "" && !taken.has(bare)) path = bare;
    }
    if (taken.has(path)) continue; // exact duplicate path inside the archive
    taken.add(path);

    if (file.text !== null) {
      const { text, rewrites: rs } = rewriteIncludes(path, file.text);
      rewrites.push(...rs);
      files.push({ ...file, path, text });
    } else {
      files.push({ ...file, path });
    }
  }

  const main = files.find((f) => f.path === "main.tex");
  let mainPath: string | null = main ? main.path : null;
  let promotedMain = false;
  if (!mainPath) {
    const tex = files.filter((f) => f.kind === "tex");
    const ranked = [...tex].sort(
      (a, b) => b.bytes.byteLength - a.bytes.byteLength,
    );
    const withDocumentClass = ranked.find((f) =>
      (f.text ?? "").includes("\\documentclass"),
    );
    const pick = withDocumentClass ?? ranked[0];
    if (pick) {
      mainPath = pick.path;
      promotedMain = true;
    }
  }

  return {
    name: bucket.name,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    mainPath,
    promotedMain,
    conversations: bucket.conversations,
    rewrites,
    // Rejections are recorded once, at parse time, against the archive; there
    // is no per-project list to keep in sync.
    rejectedPaths: [],
  };
}