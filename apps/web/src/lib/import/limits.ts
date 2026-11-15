// Import limits shared by the route and the importer (spec §13.2).
//
// Until Task 12 wires `IMPORT_MAX_*` through the env schema these are read
// straight from `process.env`; after that they come from `loadWebEnv()` so the
// value is validated in one place with every other setting.
export type ImportLimits = {
  maxFileBytes?: number;
  maxTotalBytes?: number;
  maxEntries?: number;
  maxProjects?: number;
};

export function limitsFromEnv(
  source: NodeJS.ProcessEnv = process.env,
): ImportLimits {
  const out: ImportLimits = {};
  const read = (name: string, apply: (value: number) => void) => {
    const raw = source[name];
    if (raw === undefined) return;
    const value = Number(raw);
    if (Number.isSafeInteger(value) && value > 0) apply(value);
  };
  read("IMPORT_MAX_FILE_BYTES", (v) => {
    out.maxFileBytes = v;
  });
  read("IMPORT_MAX_TOTAL_BYTES", (v) => {
    out.maxTotalBytes = v;
  });
  read("IMPORT_MAX_ENTRIES", (v) => {
    out.maxEntries = v;
  });
  read("IMPORT_MAX_PROJECTS", (v) => {
    out.maxProjects = v;
  });
  return out;
}