import { structuredPatch } from "diff";
import type {
  DiffHunk,
  DiffProposal,
} from "@spektrum/shared/ai/diff";
import { sha256Hex } from "@spektrum/shared/hash";

export class DiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiffError";
  }
}

type DocRef = { kind?: string; blobKey?: string | null };

function assertTextDocument(doc: DocRef): void {
  if (doc.kind === "img" || doc.blobKey) {
    throw new DiffError("binary document");
  }
}

function hunks(path: string, original: string, next: string): DiffHunk[] {
  return structuredPatch(path, path, original, next, "", "", {
    context: 3,
  }).hunks as DiffHunk[];
}

async function build(
  path: string,
  original: string,
  next: string,
  kind: DiffProposal["kind"],
  reason: string,
): Promise<DiffProposal> {
  return {
    path,
    kind,
    hunks: hunks(path, original, next),
    originalHash: await sha256Hex(original),
    proposedContent: next,
    reason,
  };
}

export async function proposeEdit(input: {
  path: string;
  original: string;
  oldText: string;
  newText: string;
  reason: string;
  kind?: string;
  blobKey?: string | null;
}): Promise<DiffProposal> {
  assertTextDocument(input);
  const count = input.original.split(input.oldText).length - 1;
  if (count !== 1) {
    throw new DiffError(`oldText occurs ${count} times`);
  }
  const next = input.original.replace(input.oldText, input.newText);
  return build(input.path, input.original, next, "replace", input.reason);
}

export async function proposeWrite(input: {
  path: string;
  original: string;
  content: string;
  reason: string;
  kind?: string;
  blobKey?: string | null;
}): Promise<DiffProposal> {
  assertTextDocument(input);
  return build(input.path, input.original, input.content, "replace", input.reason);
}

export async function proposeCreate(input: {
  path: string;
  content: string;
  reason: string;
  kind?: string;
  blobKey?: string | null;
}): Promise<DiffProposal> {
  assertTextDocument(input);
  return build(input.path, "", input.content, "create", input.reason);
}

export async function proposeDelete(input: {
  path: string;
  original: string;
  reason: string;
  kind?: string;
  blobKey?: string | null;
}): Promise<DiffProposal> {
  assertTextDocument(input);
  return build(input.path, input.original, "", "delete", input.reason);
}