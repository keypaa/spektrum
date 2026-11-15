// Prometheus registry for /api/metrics (spec §19.4).
//
// Only process-level metrics live here. Request-level metrics are recorded by
// Caddy (see docker/Caddyfile), which is the only component that sees every
// request with its status and latency: the proxy is compiled into its own
// bundle, so a counter it increments would never be visible to this registry —
// the counter would read zero forever, which is worse than no counter.
import { Registry, collectDefaultMetrics } from "prom-client";

export const registry = new Registry();

collectDefaultMetrics({
  register: registry,
  // The event-loop lag and GC metrics are the useful ones for a single-process
  // Node app; the rest are cheap.
  eventLoopMonitoringPrecision: 10,
});