// Worker health endpoint (spec §19.4).
//
// A plain `node:http` server rather than a framework: the worker is a BullMQ
// process, and the compose healthcheck only needs a 200 on /health. It reports
// liveness, not queue depth — that belongs in metrics, not in a probe body.
import { createServer, type Server } from "node:http";

export function startHealthServer(port: number): Server {
  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/health" || path === "/") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("ok");
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  });
  server.listen(port);
  return server;
}