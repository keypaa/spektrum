// Accepting a diff proposal: the server never writes document content, so the
// client applies the proposal to its buffer and saves through the normal PATCH.
//
// The save is path-targeted: a proposal may target a document that is not the
// active tab. `openPath` + `whenLoaded` commit the target before the buffer is
// read, and the PATCH uses the *target* document id/baseline — never the
// autosave closure's active id (which would 409 or write the wrong file).

import {
  applyHunks as applyHunksToText,
  type DiffHunk,
} from "@spektrum/shared/ai/diff";
import type { MessagePart } from "@spektrum/shared/ai";

export type DiffPart = Extract<MessagePart, { type: "diff" }>;

/** The documents PATCH cap is 512 KB, measured in UTF-16 code units. */
export const MAX_DOCUMENT_CHARS = 524_288;

export const TOO_LARGE_MESSAGE =
  "This edit is too large to save — split it into smaller changes.";

export function exceedsLimit(content: string): boolean {
  return content.length > MAX_DOCUMENT_CHARS;
}

export interface DiffAcceptContext {
  projectId: string;
  activePath: string | null;
  findDoc(path: string): { id: string; updatedAt?: string } | undefined;
  currentContent(path: string): string;
  baselineFor(path: string): string;
  openPath(path: string): Promise<void>;
  whenLoaded(path: string): Promise<void>;
  applyHunks(path: string, hunks: DiffHunk[]): void;
  save(
    documentId: string,
    content: string,
    baseUpdatedAt: string,
  ): Promise<{ updatedAt: string }>;
  create(path: string): Promise<{ id: string; updatedAt: string }>;
  remove(path: string): Promise<void>;
  onSaved(path: string, content: string, updatedAt: string): void;
}

export type AcceptResult = { ok: true } | { ok: false; error: string };

export async function acceptDiff(
  part: DiffPart,
  ctx: DiffAcceptContext,
): Promise<AcceptResult> {
  const { proposal } = part;

  if (proposal.kind !== "delete" && exceedsLimit(proposal.proposedContent)) {
    return { ok: false, error: TOO_LARGE_MESSAGE };
  }

  // A create targets a path that does not exist yet, so it must not wait for a
  // document to load. Replace/delete target an existing document.
  if (proposal.kind !== "create" && proposal.path !== ctx.activePath) {
    await ctx.openPath(proposal.path);
    await ctx.whenLoaded(proposal.path);
  }

  if (proposal.kind === "delete") {
    await ctx.remove(proposal.path);
    return { ok: true };
  }

  if (proposal.kind === "create") {
    const existing = ctx.findDoc(proposal.path);
    const doc = existing ?? (await ctx.create(proposal.path));
    // A freshly created row has no prior baseline: save against the `updatedAt`
    // the create returned. An existing row uses the caller's baseline.
    const base = existing
      ? ctx.baselineFor(proposal.path)
      : doc.updatedAt ?? ctx.baselineFor(proposal.path);
    const result = await ctx.save(doc.id, proposal.proposedContent, base);
    ctx.onSaved(proposal.path, proposal.proposedContent, result.updatedAt);
    return { ok: true };
  }

  const doc = ctx.findDoc(proposal.path);
  if (!doc) {
    return { ok: false, error: "The document is no longer available." };
  }
  const next = applyHunksToText(ctx.currentContent(proposal.path), proposal.hunks);
  ctx.applyHunks(proposal.path, proposal.hunks);
  const result = await ctx.save(doc.id, next, ctx.baselineFor(proposal.path));
  ctx.onSaved(proposal.path, next, result.updatedAt);
  return { ok: true };
}