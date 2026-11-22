import { IMAGE_LIMITS, type MessagePart } from "@spektrum/shared/ai";
import type { GatewayContentPart } from "./gateway";
import { readChatImage } from "./image-attachments";

export type ImagePart = Extract<MessagePart, { type: "image" }>;

export type HistoryTurn = {
  role: "user" | "assistant";
  text: string;
  images: ImagePart[];
};

/** Stand-in for images that no longer fit the request budget. */
export const IMAGE_OMITTED_MARKER = "[image omitted — re-attach to discuss]";

/**
 * Assemble the step-0 user message for the gateway. Text-only threads keep a
 * plain string; any image turns the content into an OpenAI-compatible array.
 *
 * Current attachments are newest, then history images run newest to oldest.
 * The count cap is applied before any storage read, so a long thread never
 * reads every image in its history — only up to the newest four candidates.
 */
export async function buildUserContent(
  text: string,
  currentImages: ImagePart[],
  history: HistoryTurn[],
): Promise<string | GatewayContentPart[]> {
  const candidates: ImagePart[] = [
    ...currentImages,
    ...[...history].reverse().flatMap((turn) => turn.images),
  ];
  if (candidates.length === 0) return text;

  const capped = candidates.slice(0, IMAGE_LIMITS.maxCount);
  const content: GatewayContentPart[] = [{ type: "text", text }];
  let totalBytes = 0;
  let omitted = candidates.length > capped.length;

  for (const part of capped) {
    const bytes = await readChatImage(part.blobKey);
    if (totalBytes + bytes.byteLength > IMAGE_LIMITS.maxHistoryBytes) {
      omitted = true;
      continue;
    }
    totalBytes += bytes.byteLength;
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${part.mimeType};base64,${bytes.toString("base64")}`,
      },
    });
  }

  if (omitted) content.push({ type: "text", text: IMAGE_OMITTED_MARKER });
  return content;
}
