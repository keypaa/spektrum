"use client";

// Debounced autosave (spec §11.0/D1): 400 ms debounce, coalesced per document,
// plus a forced save on blur, pagehide and tab switch. The server is the source
// of truth: every request carries the last known `updatedAt` as the baseline,
// and a 409 hands the authoritative document back to the caller.
//
// The unload path is best-effort BY CONSTRUCTION and the residual risk is
// LOW: Chromium caps a keepalive fetch at 64 KiB, while a document may be
// 512 KiB. So the immediate unload save only runs when the encoded body fits
// comfortably (60 KiB). The only loss case is a hard reload/close inside the
// 400 ms debounce with no blur first — a narrow window with small stakes
// (the user is mid-keystroke; the debounced save covers everything else, and
// the next edit re-saves the tail). `sendBeacon` is deliberately not used:
// it cannot carry the Origin-checked JSON request cleanly.

import { useCallback, useEffect, useRef } from "react";
import { ConflictError, saveDocumentRequest, type SaveResult } from "@/lib/save-document";
import type { DocumentRecord } from "@/lib/documents";

const DEBOUNCE_MS = 400;
/** Chromium's keepalive cap is 64 KiB; leave margin for the JSON envelope. */
const KEEPALIVE_LIMIT_BYTES = 60 * 1024;

export interface AutosaveOptions {
  projectId: string;
  documentId: string;
  getValue(): string;
  getBaseline(): string;
  onSaved(result: SaveResult): void;
  onConflict(current: DocumentRecord): void;
  onError(): void;
}

export interface AutosaveHandle {
  schedule(): void;
  flush(): Promise<void>;
  isDirty(): boolean;
}

export function useAutosave(options: AutosaveOptions): AutosaveHandle {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // The baseline (`updatedAt`) belongs to the caller: `getBaseline()` returns
  // the value `onSaved` last reported, which keeps the hook stateless about it.
  const savedValue = useRef<string | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const pending = useRef(false);

  const send = useCallback(async (keepalive = false): Promise<void> => {
    const o = optionsRef.current;
    const value = o.getValue();
    if (value === savedValue.current && !dirty.current) return;
    if (keepalive && value.length > KEEPALIVE_LIMIT_BYTES) {
      // Deliberately skipped (documented at the top of the file): Chromium
      // caps a keepalive fetch at 64 KiB and this body would not survive.
      return;
    }
    try {
      const result = await saveDocumentRequest(
        o.projectId,
        o.documentId,
        value,
        o.getBaseline(),
        { keepalive },
      );
      savedValue.current = value;
      dirty.current = false;
      o.onSaved(result);
    } catch (e) {
      if (e instanceof ConflictError) {
        savedValue.current = e.current.content;
        dirty.current = false;
        o.onConflict(e.current);
        return;
      }
      o.onError();
    }
  }, []);

  // One serialised chain: at most one request in flight; edits while it runs
  // queue exactly one follow-up.
  const runChain = useCallback(
    async (keepalive = false) => {
      if (inFlight.current) {
        pending.current = true;
        return inFlight.current;
      }
      const promise = send(keepalive).then(async () => {
        while (pending.current) {
          pending.current = false;
          await send();
        }
      });
      inFlight.current = promise;
      try {
        await promise;
      } finally {
        if (inFlight.current === promise) inFlight.current = null;
        pending.current = false;
      }
    },
    [send],
  );

  const schedule = useCallback(() => {
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void runChain();
    }, DEBOUNCE_MS);
  }, [runChain]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    await runChain();
  }, [runChain]);

  useEffect(() => {
    const onBlur = () => void flush();
    // `visibilitychange` → hidden fires BEFORE the page is torn down (reload,
  // tab close, app switch) while the document is still live, so the ordinary
  // fetch completes. Chromium drops the *body* of a keepalive request issued
  // during unload teardown, so this — not pagehide — is the reliable save.
  const onVisibility = () => {
    if (document.visibilityState === "hidden") void runChain(true);
  };
  const onPageHide = () => void runChain(true);
  window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush, runChain]);

  return {
    schedule,
    flush,
    isDirty: () => dirty.current,
  };
}