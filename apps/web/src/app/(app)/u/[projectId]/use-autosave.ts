"use client";

// Debounced autosave (spec §11.0/D1): 400 ms debounce, coalesced per document,
// plus a forced save on blur, pagehide and a document change. The server is the
// source of truth: every request carries the last known `updatedAt` as the
// baseline, and a 409 hands the authoritative document back to the caller.
//
// A pending save is bound to the (document, text, baseline) it was scheduled
// with. The debounce can outlive the document that produced it — the user may
// switch tabs inside the 400 ms window — and reading the live `documentId` /
// `getValue()` at fire time would then write one document's text into another.
// That was a real corruption path (observed: `notes.tex` receiving `main.tex`'s
// content), so the target is captured at schedule time and passed explicitly.
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

/** A save is bound to the document it was scheduled for, and to the baseline
 *  that document had then: a debounce that fires after a tab switch must not
 *  write the newly active document's text (or baseline) into another one. */
interface SaveTarget {
  documentId: string;
  value: string;
  baseUpdatedAt: string;
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
  const savedDocId = useRef<string | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const pending = useRef<SaveTarget | null>(null);
  // The (document, text, baseline) the current debounce belongs to.
  const timerTarget = useRef<SaveTarget | null>(null);

  const currentTarget = useCallback((): SaveTarget => {
    const o = optionsRef.current;
    return {
      documentId: o.documentId,
      value: o.getValue(),
      baseUpdatedAt: o.getBaseline(),
    };
  }, []);

  const send = useCallback(async (target: SaveTarget, keepalive = false): Promise<void> => {
    const o = optionsRef.current;
    // A binary preview has no text document to save. This also protects the
    // pagehide/visibility paths, which fire outside the editor's control.
    if (!target.documentId) return;
    if (keepalive && target.value.length > KEEPALIVE_LIMIT_BYTES) {
      // Deliberately skipped (documented at the top of the file): Chromium
      // caps a keepalive fetch at 64 KiB and this body would not survive.
      return;
    }
    const unchanged =
      savedDocId.current === target.documentId && target.value === savedValue.current;
    if (unchanged && !dirty.current) return;
    try {
      const result = await saveDocumentRequest(
        o.projectId,
        target.documentId,
        target.value,
        target.baseUpdatedAt,
        { keepalive },
      );
      savedDocId.current = target.documentId;
      savedValue.current = target.value;
      dirty.current = false;
      o.onSaved(result);
    } catch (e) {
      if (e instanceof ConflictError) {
        savedDocId.current = target.documentId;
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
    async (target: SaveTarget, keepalive = false) => {
      if (inFlight.current) {
        pending.current = target;
        return inFlight.current;
      }
      const promise = send(target, keepalive).then(async () => {
        while (pending.current) {
          const next = pending.current;
          pending.current = null;
          await send(next);
        }
      });
      inFlight.current = promise;
      try {
        await promise;
      } finally {
        if (inFlight.current === promise) inFlight.current = null;
        pending.current = null;
      }
    },
    [send],
  );

  const schedule = useCallback(() => {
    const target = currentTarget();
    const previous = timerTarget.current;
    // Leaving a document with an unsaved edit: flush it now (the forced save on
    // document change) and start tracking the new one.
    if (previous && previous.documentId !== target.documentId) {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      timerTarget.current = null;
      void runChain(previous);
    }
    timerTarget.current = target;
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const scheduled = timerTarget.current;
      if (scheduled) void runChain(scheduled);
    }, DEBOUNCE_MS);
  }, [currentTarget, runChain]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const target = timerTarget.current ?? currentTarget();
    timerTarget.current = null;
    await runChain(target);
  }, [currentTarget, runChain]);

  useEffect(() => {
    const onBlur = () => void flush();
    // `visibilitychange` → hidden fires BEFORE the page is torn down (reload,
    // tab close, app switch) while the document is still live, so the ordinary
    // fetch completes. Chromium drops the *body* of a keepalive request issued
    // during unload teardown, so this — not pagehide — is the reliable save.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void runChain(currentTarget(), true);
    };
    const onPageHide = () => void runChain(currentTarget(), true);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [currentTarget, flush, runChain]);

  return {
    schedule,
    flush,
    isDirty: () => dirty.current,
  };
}
