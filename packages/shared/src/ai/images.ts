import { z } from "zod";

/**
 * Hard caps for images pasted into the chat. The browser downscales to
 * `maxEdge` before encoding; the server enforces the count and byte caps.
 */
export const IMAGE_LIMITS = {
  maxCount: 4,
  maxBytesPerImage: 1024 * 1024,
  maxHistoryBytes: 4 * 1024 * 1024,
  maxEdge: 1536,
} as const;

export const imageMimeTypeSchema = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export type ImageMimeType = z.infer<typeof imageMimeTypeSchema>;

/** A pasted image on its way to the chat route; `data` is base64 only. */
export const chatImageAttachmentSchema = z.object({
  id: z.string(),
  mimeType: imageMimeTypeSchema,
  data: z
    .string()
    .refine(
      (data) =>
        Buffer.from(data, "base64").byteLength <= IMAGE_LIMITS.maxBytesPerImage,
      {
        message: `Image must decode to at most ${IMAGE_LIMITS.maxBytesPerImage} bytes`,
      },
    ),
});

export type ChatImageAttachment = z.infer<typeof chatImageAttachmentSchema>;

export const chatImageAttachmentsSchema = z
  .array(chatImageAttachmentSchema)
  .max(IMAGE_LIMITS.maxCount);

/** The Settings override: detect automatically, force images on, or force off. */
export const imageSupportSchema = z.enum(["auto", "on", "off"]);

export type ImageSupportPreference = z.infer<typeof imageSupportSchema>;
