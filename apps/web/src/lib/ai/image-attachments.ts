// Pasted chat images are attachments, not workspace files. The browser puts
// the bytes straight into R2 and sends only a key: this module re-checks that
// the key belongs to this user and is of the chat-image kind, then reads the
// object back so its actual size is enforced before the key is persisted.
// The quota was charged when /api/uploads/sign minted the key; no charge here.
import { getObject } from "@spektrum/storage";
import type { ChatImageRef, MessagePart } from "@spektrum/shared/ai";
import { assertScopedKey } from "@/lib/upload/scoped-key";
import { MAX_UPLOAD_BYTES } from "@/lib/upload/quotas";

type ImagePart = Extract<MessagePart, { type: "image" }>;

export type ResolvedChatImage =
  | { kind: "ok"; part: ImagePart }
  | { kind: "foreign" }
  | { kind: "missing" }
  | { kind: "too_large" };

/** Build the persisted part from the ref. ids are client-supplied for live
 * thumbnails; generate one when absent or collided in the same request. */
export function chatImagePart(ref: ChatImageRef, usedIds?: Set<string>): ImagePart {
  const id = ref.id && !usedIds?.has(ref.id) ? ref.id : crypto.randomUUID();
  usedIds?.add(id);
  return {
    type: "image",
    id,
    blobKey: ref.blobKey,
    name: ref.name || "image",
    mimeType: ref.mimeType,
  };
}

/**
 * Validate a client-supplied key before any part is persisted. A foreign key
 * is a client error; an unreadable object is reported as "missing" so the
 * caller can omit it without turning the whole turn into a 500.
 */
export async function resolveChatImageRef(
  userId: string,
  ref: ChatImageRef,
  usedIds?: Set<string>,
): Promise<ResolvedChatImage> {
  if (!assertScopedKey(userId, "chat-image", ref.blobKey)) {
    return { kind: "foreign" };
  }
  let object: Awaited<ReturnType<typeof getObject>>;
  try {
    object = await getObject("uploads", ref.blobKey);
  } catch {
    // Same degradation as buildUserContent: an inaccessible image is omitted,
    // never fatal to the surrounding text turn.
    return { kind: "missing" };
  }
  if (object.size > MAX_UPLOAD_BYTES["chat-image"]) {
    return { kind: "too_large" };
  }
  return { kind: "ok", part: chatImagePart(ref, usedIds) };
}

/** Read a chat attachment's decoded bytes by its blob key. */
export async function readChatImage(blobKey: string): Promise<Buffer> {
  const object = await getObject("uploads", blobKey);
  return object.body;
}
