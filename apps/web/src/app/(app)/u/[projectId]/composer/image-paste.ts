import {
  IMAGE_LIMITS,
  type ChatImageAttachment,
  type ImageMimeType,
} from "@spektrum/shared/ai";

/**
 * Browser-side preparation of clipboard images. The server remains the
 * validator (`chatImageAttachmentSchema` uses Node's Buffer, so it must never
 * run here): this module only decodes, downscales, re-encodes and encodes.
 */

const ALLOWED_MIMES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

// WebP first; progressively cheaper fallbacks still fit the allowlist. A frame
// that cannot fit the decoded-byte cap after every attempt is dropped.
const ENCODE_ATTEMPTS: ReadonlyArray<{ mimeType: ImageMimeType; quality: number }> = [
  { mimeType: "image/webp", quality: 0.82 },
  { mimeType: "image/webp", quality: 0.65 },
  { mimeType: "image/jpeg", quality: 0.75 },
  { mimeType: "image/jpeg", quality: 0.5 },
];

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

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

async function toAttachment(file: File): Promise<ChatImageAttachment | null> {
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
      const data = toBase64(new Uint8Array(await blob.arrayBuffer()));
      return { id: newId(), mimeType: attempt.mimeType, data };
    }
    return null;
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

/**
 * Turn image items from a paste event into attachments. Non-image items,
 * undecodable files and files still over the byte cap are skipped; at most
 * `IMAGE_LIMITS.maxCount` images are decoded.
 */
export async function readPastedImages(
  items: DataTransferItemList | DataTransferItem[],
): Promise<ChatImageAttachment[]> {
  const files = Array.from(items)
    .filter((item) => item?.kind === "file" && ALLOWED_MIMES.has(item.type))
    .slice(0, IMAGE_LIMITS.maxCount)
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null && file !== undefined);
  const encoded = await Promise.all(files.map(toAttachment));
  return encoded.filter((attachment): attachment is ChatImageAttachment => attachment !== null);
}
