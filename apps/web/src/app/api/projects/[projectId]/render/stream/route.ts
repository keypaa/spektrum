import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { getLatestRender } from "@/lib/render-store";
import { getRedis } from "@spektrum/shared/rate-limit";
import {
  renderChannel,
  type RenderEvent,
  type RenderStatus,
} from "@spektrum/shared/compile";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  const user = await requireUser();
  const { projectId } = await ctx.params;
  if (!UUID_RE.test(projectId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const latest = await getLatestRender(user.id, projectId);
  const encoder = new TextEncoder();
  const subscriber = getRedis().duplicate({ maxRetriesPerRequest: null });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: RenderEvent): void => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`),
        );
      };

      if (latest) {
        send({
          event: "status",
          state: latest.render.status as RenderStatus,
          revision: latest.render.revision,
        });
      }

      const onMessage = (_channel: string, message: string): void => {
        try {
          const parsed = JSON.parse(message) as RenderEvent;
          if (parsed && typeof parsed.event === "string") send(parsed);
        } catch {
          /* ignore malformed frames */
        }
      };

      void subscriber
        .subscribe(renderChannel(projectId))
        .then(() => subscriber.on("message", onMessage))
        .catch(() => undefined);

      const ping = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": ping\n\n"));
      }, 15_000);

      const close = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        subscriber.off("message", onMessage);
        void subscriber.unsubscribe(renderChannel(projectId)).catch(() => undefined);
        subscriber.disconnect();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}