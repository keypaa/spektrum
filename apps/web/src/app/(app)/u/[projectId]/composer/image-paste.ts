import {
  IMAGE_LIMITS,
  type ChatImageRef,
  type ImageMimeType,
} from "@spektrum/shared/ai";

/**
 * Browser-side preparation of clipboard images. The server remains the
 * validator: this module only decodes, downscales and re-encodes before handing
 * the bytes to the uploader. The resulting key — never the bytes — is sent to
 * the chat route.
 */

const ALLOWED_MIMES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

// Refuse to decode absurd source files before createImageBitmap allocates a
// bitmap. Well-behaved pastes are far smaller; this is a backstop.
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

// WebP first; progressively cheaper fallbacks still fit the allowlist. A frame
// that cannot fit the decoded-byte cap after every attempt is dropped.
const ENCODE_ATTEMPTS: ReadonlyArray<{ mimeType: ImageMimeType; quality: number }> = [
  { mimeType: "image/webp", quality: 0.82 },
  { mimeType: "image/webp", quality: 0.65 },
  { mimeType: "image/jpeg", quality: 0.75 },
  { mimeType: "image/jpeg", quality: 0.5 },
];

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: ImageMimeType,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("canvas encode failed"))),
        mimeType,
        quality,
      );
    } catch (error) {
      reject(error);
    }
  });
}

async function toEncodedImage(
  file: File,
): Promise<{ bytes: Uint8Array; mimeType: ImageMimeType } | null> {
  if (file.size > MAX_SOURCE_BYTES) return null;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, IMAGE_LIMITS.maxEdge / longestEdge);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);

    for (const attempt of ENCODE_ATTEMPTS) {
      const blob = await canvasToBlob(canvas, attempt.mimeType, attempt.quality);
      if (blob.size > IMAGE_LIMITS.maxBytesPerImage) continue;
      // Engines without WebP encoding silently fall back to PNG bytes. Label
      // the attachment with what the canvas actually produced when it is an
      // allowed type; otherwise keep the type we asked for.
      const mimeType = ALLOWED_MIMES.has(blob.type)
        ? (blob.type as ImageMimeType)
        : attempt.mimeType;
      return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType };
    }
    return null;
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

/**
 * Turn image items from a paste event into uploaded refs. Non-image items,
 * undecodable files, files still over the byte cap and failed uploads are
 * skipped; at most `IMAGE_LIMITS.maxCount` images are decoded and uploaded.
 */
export async function readPastedImages(
  items: DataTransferItemList | DataTransferItem[],
  upload: (
    bytes: Uint8Array,
    mimeType: ImageMimeType,
  ) => Promise<ChatImageRef>,
): Promise<ChatImageRef[]> {
  const files = Array.from(items)
    .filter((item) => item?.kind === "file" && ALLOWED_MIMES.has(item.type))
    .slice(0, IMAGE_LIMITS.maxCount)
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null && file !== undefined);
  const encoded = await Promise.all(
    files.map(async (file) => {
      const image = await toEncodedImage(file);
      if (!image) return null;
      try {
        return await upload(image.bytes, image.mimeType);
      } catch {
        // An upload can fail (quota, network); drop this image and keep the
        // rest of the paste instead of blocking the message.
        return null;
      }
    }),
  );
  return encoded.filter((ref): ref is ChatImageRef => ref !== null);
}
