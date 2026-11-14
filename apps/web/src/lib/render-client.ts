import { useCallback, useEffect, useRef, useState } from "react";
import {
  renderEventSchema,
  type RenderEvent,
} from "@spektrum/shared/compile";

/** Parse one SSE `data:` payload; null when it is not a render event. */
export function parseRenderEvent(data: string): RenderEvent | null {
  try {
    const parsed = renderEventSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface RenderState {
  status: RenderEvent | null;
  connected: boolean;
}

/** Subscribe to a project's render stream. */
export function useRenderStream(projectId: string): RenderState {
  const [state, setState] = useState<RenderEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const retryRef = useRef(0);

  const connect = useCallback(() => {
    // jsdom (unit tests) and SSR have no EventSource; the e2e covers the live path.
    if (typeof EventSource === "undefined") return () => undefined;
    const source = new EventSource(
      `/api/projects/${projectId}/render/stream`,
    );
    source.onopen = () => {
      retryRef.current = 0;
      setConnected(true);
    };
    source.addEventListener("status", (e) => {
      const event = parseRenderEvent((e as MessageEvent).data);
      if (event) setState(event);
    });
    source.addEventListener("log", (e) => {
      const event = parseRenderEvent((e as MessageEvent).data);
      if (event) setState(event);
    });
    source.addEventListener("result", (e) => {
      const event = parseRenderEvent((e as MessageEvent).data);
      if (event) setState(event);
    });
    source.addEventListener("conflict", (e) => {
      const event = parseRenderEvent((e as MessageEvent).data);
      if (event) setState(event);
    });
    source.onerror = () => {
      setConnected(false);
      source.close();
      retryRef.current += 1;
      if (retryRef.current <= 5) {
        setTimeout(connect, 500 * retryRef.current);
      }
    };
    return () => source.close();
  }, [projectId]);

  useEffect(() => connect(), [connect]);

  return { status: state, connected };
}