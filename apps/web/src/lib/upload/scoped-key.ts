// Every large upload is stored under a key the server generates, scoped to
// one user and one kind. Later tasks re-check that same shape with
// assertScopedKey before persisting a client-supplied key, so a user cannot
// point an import/chat/render at another tenant's object.

export const UPLOAD_KINDS = [
  "import",
  "workspace",
  "chat-image",
  "render",
] as const;

export type UploadKind = (typeof UPLOAD_KINDS)[number];

const EXT_PATTERN = /^[a-z0-9]{1,16}$/;
const UUID_SEGMENT = "[0-9a-f-]{36}";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Server-generated object key: `u/<userId>/<kind>/<uuid>.<ext>`. */
export function scopedKey(userId: string, kind: UploadKind, ext: string): string {
  if (userId.includes("/") || userId.includes("\\")) {
    throw new Error("invalid user id for a scoped key");
  }
  if (!EXT_PATTERN.test(ext)) {
    throw new Error("invalid extension for a scoped key");
  }
  return `u/${userId}/${kind}/${crypto.randomUUID()}.${ext}`;
}

/**
 * True only for a key that the server could have generated for this exact
 * user and kind. The pattern is anchored so a key cannot smuggle a prefix or
 * an extra path segment past the check.
 */
export function assertScopedKey(
  userId: string,
  kind: UploadKind,
  key: string,
): boolean {
  if (userId.includes("/") || userId.includes("\\")) return false;
  const pattern = new RegExp(
    `^u/${escapeRegExp(userId)}/${escapeRegExp(kind)}/${UUID_SEGMENT}\\.[a-z0-9]{1,16}$`,
  );
  return pattern.test(key);
}
