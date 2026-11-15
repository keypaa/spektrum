// @vitest-environment node
// The import lock serialises imports inside one process, but two web instances
// (or a retried request) can still race the unique index. Losing that race
// means the archive is already imported: report a duplicate, not a 500.
import { describe, expect, it } from "vitest";
import { isDuplicateImport } from "./import-archive";

const uniqueViolation = (constraint?: string) => {
  const error = new Error('duplicate key value violates unique constraint "x"') as Error & {
    code: string;
    constraint?: string;
    cause?: unknown;
  };
  error.code = "23505";
  if (constraint) error.constraint = constraint;
  return error;
};

describe("isDuplicateImport", () => {
  it("recognises the import-batch unique violation", () => {
    expect(isDuplicateImport(uniqueViolation("import_batches_owner_project_hash_key"))).toBe(true);
  });

  it("recognises a unique violation with no constraint name", () => {
    expect(isDuplicateImport(uniqueViolation())).toBe(true);
  });

  it("follows a wrapped cause", () => {
    const wrapped = new Error("db error", { cause: uniqueViolation() });
    expect(isDuplicateImport(wrapped)).toBe(true);
  });

  it("ignores a different constraint and unrelated errors", () => {
    expect(isDuplicateImport(uniqueViolation("documents_project_path_key"))).toBe(false);
    expect(isDuplicateImport(new Error("boom"))).toBe(false);
    expect(isDuplicateImport(null)).toBe(false);
  });
});