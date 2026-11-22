// The chat store keeps the role on the message row, not on each part. User
// text therefore carries a marker so the transcript can tell a user turn from
// an assistant reply when parts are merged back together.

import type { MessagePart } from "@spektrum/shared/ai";

export const USER_TEXT_PREFIX = "User: ";

export function isUserTextPart(part: MessagePart | undefined): boolean {
  return part?.type === "text" && part.text.startsWith(USER_TEXT_PREFIX);
}
