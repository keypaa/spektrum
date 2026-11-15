// Import limits shared by the route and the importer (spec §13.2.4).
import { loadWebEnv } from "@spektrum/shared/env";

export type ImportLimits = {
  maxFileBytes?: number;
  maxTotalBytes?: number;
  maxEntries?: number;
  maxProjects?: number;
  maxRatio?: number;
};

/**
 * Import limits from the validated environment (`IMPORT_MAX_*`).
 *
 * `loadWebEnv` applies the defaults, so every value is present; the importer
 * still treats them as overrides on top of its own constants, which is what
 * lets a caller pass an explicit subset.
 */
export function limitsFromEnv(
  source: NodeJS.ProcessEnv = process.env,
): ImportLimits {
  const env = loadWebEnv(source);
  return {
    maxFileBytes: env.importMaxFileBytes,
    maxTotalBytes: env.importMaxTotalBytes,
    maxEntries: env.importMaxEntries,
    maxProjects: env.importMaxProjects,
    maxRatio: env.importMaxRatio,
  };
}