// Browser helper for direct-to-R2 uploads. The large bytes go straight from
// the browser to the signed PUT URL, so the only request that crosses Vercel
// carries a small JSON body with the resulting key.
import type { UploadKind } from "./scoped-key";

type SignedUpload = {
  key: string;
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
};

export type R2UploadInput = {
  bytes: Uint8Array;
  contentType: string;
  kind: UploadKind;
  ext: string;
  /** Only used to give a failing upload useful context in the UI. */
  projectId?: string;
};

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `upload failed: ${res.status}`;
  } catch {
    return `upload failed: ${res.status}`;
  }
}

/** Sign → PUT the bytes to R2 → return the key the server will later verify. */
export async function uploadBytesToR2({
  bytes,
  contentType,
  kind,
  ext,
  projectId,
}: R2UploadInput): Promise<string> {
  const scope = projectId ? ` for project ${projectId}` : "";
  const signRes = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind,
      ext,
      contentType,
      sizeBytes: bytes.byteLength,
    }),
  });
  if (!signRes.ok) throw new Error(`${await readError(signRes)}${scope}`);

  const signed = (await signRes.json()) as SignedUpload;
  const putRes = await fetch(signed.url, {
    method: "PUT",
    headers: signed.headers,
    // DOM's BodyInit type lags behind the runtime: browsers accept any
    // BufferSource as a fetch body, including a Uint8Array view without a
    // fresh ArrayBuffer, so no copy of the (up to 30 MB) upload is needed.
    body: bytes as unknown as BodyInit,
  });
  if (!putRes.ok) {
    throw new Error(`upload failed: ${putRes.status}${scope}`);
  }
  return signed.key;
}
