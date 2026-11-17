// Load test for the two endpoints that must stay up under load (spec §19.7).
//
//   pnpm loadtest [baseUrl]
//
// Runs autocannon against /login (unauthenticated, the proxy's cookie gate is
// the interesting part) and /api/health (the probe a load balancer hammers),
// then prints p50/p97.5/p99 and exits non-zero if anything answered non-2xx.
//
// autocannon emits a fixed percentile set and has no `p95`; asking for it
// yields undefined and crashes the report, so these are the ones it really has.
import autocannon from "autocannon";

type Result = {
  non2xx: number;
  latency: { p50: number; p97_5: number; p99: number };
  // bytes per second — labelled separately in the report, never as req/s.
  throughput: { average: number };
  requests: { average: number };
};

const CONNECTIONS = 10;
const DURATION_SECONDS = 10;

const paths = ["/login", "/api/health"];

function measure(url: string): Promise<Result> {
  return new Promise((resolve, reject) => {
    autocannon(
      { url, connections: CONNECTIONS, duration: DURATION_SECONDS },
      (err, result) => {
        if (err) reject(err);
        else resolve(result as unknown as Result);
      },
    );
  });
}

const ms = (value: number) => `${value.toFixed(1)} ms`;

/** Returns a process exit code. Exported so the test can drive it directly. */
export async function run(baseUrl: string): Promise<number> {
  const base = baseUrl.replace(/\/+$/, "");
  let failed = false;

  for (const path of paths) {
    const url = `${base}${path}`;
    const result = await measure(url);
    console.log(
      `${url} — p50 ${ms(result.latency.p50)} p97.5 ${ms(result.latency.p97_5)} ` +
        `p99 ${ms(result.latency.p99)} · ${Math.round(result.requests.average)} req/s · ` +
        `${(result.throughput.average / 1024 / 1024).toFixed(1)} MB/s · ` +
        `non2xx ${result.non2xx}`,
    );
    if (result.non2xx > 0) failed = true;
  }

  return failed ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = process.argv[2] ?? process.env.PUBLIC_URL ?? "http://localhost:3000";
  const code = await run(base);
  process.exit(code);
}