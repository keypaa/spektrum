// Pasted chat images are attachments, not workspace files: they live in the
// `uploads` bucket under chat/<projectId>/<uuid>.<ext> and never enter the file
// tree or the compile revision. The key is scoped by project, not by uploader;
// ownership is enforced by callers through `getThread` (project owner only).
import { getObject, putObject } from "@spektrum/storage";
import type {
  ChatImageAttachment,
  ImageMimeType,
  MessagePart,
} from "@spektrum/shared/ai";

type ImagePart = Extract<MessagePart, { type: "image" }>;

const EXT_BY_MIME: Record<ImageMimeType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function storeChatImage(
  // Ownership is checked by the chat route before storing; the key is
  // project-scoped, so the uploader's id is not part of it.
  _userId: string,
  projectId: string,
  attachment: ChatImageAttachment,
): Promise<{ blobKey: string; part: ImagePart }> {
  const ext = EXT_BY_MIME[attachment.mimeType];
  const blobKey = `chat/${projectId}/${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(attachment.data, "base64");
  await putObject("uploads", blobKey, bytes, attachment.mimeType);
  return {
    blobKey,
    part: {
      type: "image",
      id: attachment.id,
      blobKey,
      name: `${attachment.id}.${ext}`,
      mimeType: attachment.mimeType,
    },
  };
}

/** Read a chat attachment's decoded bytes by its blob key. */
export async function readChatImage(blobKey: string): Promise<Buffer> {
  const object = await getObject("uploads", blobKey);
  return object.body;
}
