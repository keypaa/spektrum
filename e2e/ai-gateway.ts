// Mock OpenAI-compatible gateway for the AI e2e (no real key, no network).
// Run from apps/web so workspace deps resolve:
//   pnpm --filter @spektrum/web exec tsx ../../e2e/ai-gateway.ts
//
// GET  /health              -> 200
// GET  /v1/models           -> { data: [{ id: "openai/gpt-4o" }] }
// GET  /requests            -> recorded requests (x-ai-mock-token: test-token)
// POST /v1/chat/completions -> text/event-stream
//
// Branch order: title -> fix -> review -> create -> delete -> tool follow-up
// -> default. Every tool branch returns a short text once the request carries a
// role:"tool" message, so the second model call ends the turn.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";

const PORT = 4010;
const TOKEN = "test-token";
const LOG = "/tmp/opencode/ai-gateway.log";

interface Recorded {
  path: string;
  authorization: string | null;
  body: unknown;
}

const recorded: Recorded[] = [];

function log(line: string): void {
  try {
    appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // logging is best-effort
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk.toString();
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sse(res: ServerResponse, frames: unknown[]): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });
  for (const frame of frames) {
    res.write(`data: ${JSON.stringify(frame)}\n\n`);
  }
  res.write("data: [DONE]\n\n");
  res.end();
}

const text = (content: string): unknown[] => [
  { choices: [{ delta: { content } }] },
  { choices: [{ delta: {}, finish_reason: "stop" }] },
];

const toolCall = (name: string, args: unknown): unknown[] => [
  {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call_1",
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  },
  { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
];

function lastUserText(messages: Array<{ role?: string; content?: unknown }>): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]!;
    if (message.role === "user") {
      return typeof message.content === "string" ? message.content : "";
    }
  }
  return "";
}

function respond(body: {
  messages?: Array<{ role?: string; content?: unknown }>;
  max_tokens?: number;
}): unknown[] {
  const messages = body.messages ?? [];
  const userText = lastUserText(messages);
  const hasTool = messages.some((message) => message.role === "tool");
  const isTitle =
    (body.max_tokens ?? Number.MAX_SAFE_INTEGER) <= 64 ||
    JSON.stringify(body).includes("Name this conversation");

  if (isTitle) {
    return text('{"title":"Fix the broken document"}');
  }
  if (userText.includes("fails to compile")) {
    return hasTool
      ? text("Fixed.")
      : toolCall("edit_file", {
          path: "main.tex",
          oldText: "\\broken{}",
          newText: "\\textbf{fixed}",
          reason: "fix the undefined control sequence",
        });
  }
  if (userText.includes("Review this paper")) {
    return text("The paper is structurally sound.");
  }
  if (userText.includes("Create a notes file")) {
    return hasTool
      ? text("Done.")
      : toolCall("create_file", {
          path: "notes.tex",
          content: "\\section{Notes}\n",
        });
  }
  if (userText.includes("Delete notes")) {
    return hasTool
      ? text("Done.")
      : toolCall("delete_file", { path: "notes.tex" });
  }
  if (hasTool) {
    return text("Done.");
  }
  return toolCall("edit_file", {
    path: "main.tex",
    oldText: "\\section{Intro}",
    newText: "\\section{Introduction}",
    reason: "rename the introduction",
  });
}

const server = createServer(async (req, res) => {
  const url = req.url ?? "";

  if (req.method === "GET" && url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "GET" && url === "/v1/models") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: "openai/gpt-4o" }] }));
    return;
  }

  if (req.method === "GET" && url === "/requests") {
    if (req.headers["x-ai-mock-token"] !== TOKEN) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "forbidden" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(recorded));
    return;
  }

  if (req.method === "DELETE" && url === "/requests") {
    if (req.headers["x-ai-mock-token"] !== TOKEN) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "forbidden" }));
      return;
    }
    recorded.length = 0;
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && url === "/v1/chat/completions") {
    const raw = await readBody(req);
    let body: { messages?: Array<{ role?: string; content?: unknown }>; max_tokens?: number };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "bad_request" }));
      return;
    }
    recorded.push({
      path: url,
      authorization: req.headers.authorization ?? null,
      body,
    });
    log(raw);
    sse(res, respond(body));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  writeFileSync(LOG, `${new Date().toISOString()} ai-gateway listening on ${PORT}\n`);
  console.log(`ai-gateway listening on http://127.0.0.1:${PORT}`);
});