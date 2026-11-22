// Read an uploaded document's blob with a Unicode fallback.
//
// Paths are canonicalised to NFC now, but rows and objects created earlier may
// still be spelled NFD (or the reverse). The same document can therefore have
// its `blob_key` and its object-store key in different forms. Trying the
// spellings lets old projects keep working without a destructive migration.

import { getObject, StorageError } from "@spektrum/storage";
import { unicodeVariants } from "@spektrum/shared/paths";

export async function getDocumentObject(blobKey: string) {
  let last: StorageError | null = null;
  for (const key of unicodeVariants(blobKey)) {
    try {
      return await getObject("uploads", key);
    } catch (error) {
      if (!(error instanceof StorageError) || error.message !== "not_found") {
        throw error;
      }
      last = error;
    }
  }
  throw last ?? new StorageError("not_found");
}
