"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  renderEventSchema,
  type RenderEvent,
} from "@spektrum/shared/compile";
import { runLocalCompile } from "@/lib/compile-client";

/** Parse one SSE `data:` payload; null when it is not a render event. */
export function parseRenderEvent(data: string): RenderEvent | null {
  try {
    const parsed = renderEventSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface LocalCompileState {
  status: RenderEvent | null;
  start(mainFile: string): Promise<void>;
}

/**
 * Local compile state for the editor. There is no server render stream on this
 * branch: `start` runs the WASM engine in this tab and publishes the same
 * `RenderEvent` shapes the status pill, logs and error banner already consume.
 */
export function useLocalCompile(projectId: string): LocalCompileState {
  const [status, setStatus] = useState<RenderEvent | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback(
    async (mainFile: string) => {
      if (!mainFile || running.current) return;
      running.current = true;
      setStatus(null);
      try {
        await runLocalCompile(projectId, mainFile, (event) => {
          if (mounted.current) setStatus(event);
        });
      } finally {
        running.current = false;
      }
    },
    [projectId],
  );

  return { status, start };
}
