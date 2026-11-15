// Database access for the e2e specs.
//
// Two environments, one helper:
//   - local dev keeps Postgres in the `spektrum-postgres` container, so the
//     specs shell into it;
//   - CI runs Postgres as a service container with no such name, so `E2E_DB_URL`
//     selects the direct path (a plain psql client).
import { execFileSync } from "node:child_process";

export function psql(sql: string): string {
  const url = process.env.E2E_DB_URL;
  if (url) {
    return execFileSync(
      "psql",
      [url, "-v", "ON_ERROR_STOP=1", "-tAc", sql],
      { encoding: "utf8" },
    ).trim();
  }
  return execFileSync(
    "docker",
    [
      "exec",
      "spektrum-postgres",
      "psql",
      "-U",
      "spektrum",
      "-d",
      "spektrum_test",
      "-v",
      "ON_ERROR_STOP=1",
      "-tAc",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}