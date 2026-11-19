// Sidebar pane resizing (spec §6.3: 240–480, default 442).
//
// Pointer-drag updates a CSS variable on the root element live; the value is
// persisted to localStorage on pointerup only (not on every move). The stored
// value is a plain JSON number under a versioned key.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export const SIDEBAR_STORAGE_KEY = "spektrum_editor_layout_v1";

export function clampWidth(px: number, min: number, max: number): number {
  if (!Number.isFinite(px)) return min;
  return Math.min(max, Math.max(min, px));
}

/** Pointer position → pane width. A right-hand pane measures in from the
 *  viewport's right edge, minus any chrome on that edge. */
export function widthFromPointer(
  clientX: number,
  viewportWidth: number,
  fromRight: boolean,
  edgeOffset = 0,
): number {
  return fromRight ? viewportWidth - clientX - edgeOffset : clientX;
}

export function readStoredWidth(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "number" || !Number.isFinite(parsed)) return fallback;
    return clampWidth(parsed, min, max);
  } catch {
    return fallback;
  }
}

export function writeStoredWidth(key: string, px: number): void {
  try {
    localStorage.setItem(key, JSON.stringify(px));
  } catch {
    // A full or disabled localStorage must not break the drag; the width is
    // still applied to the DOM.
  }
}

export interface ResizablePaneOptions {
  storageKey: string;
  cssVar: string;
  initial: number;
  min: number;
  max: number;
  rootRef: RefObject<HTMLElement | null>;
  /** Right-hand panes measure from the viewport's right edge. */
  fromRight?: boolean;
  /** Space reserved on the measured edge (e.g. the grid's right padding). */
  edgeOffset?: number;
}

export function useResizablePane(options: ResizablePaneOptions): {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  dragging: boolean;
} {
  const { storageKey, cssVar, initial, min, max, rootRef, fromRight = false, edgeOffset = 0 } = options;
  const [dragging, setDragging] = useState(false);
  const width = useRef(readStoredWidth(storageKey, initial, min, max));

  /** Set the width directly (mount / restore path). */
  const applyWidth = useCallback(
    (px: number) => {
      width.current = clampWidth(px, min, max);
      rootRef.current?.style.setProperty(cssVar, `${width.current}px`);
    },
    [cssVar, min, max, rootRef],
  );

  /** Pointer position → width → apply (drag path). */
  const applyFromPointer = useCallback(
    (clientX: number) => {
      applyWidth(widthFromPointer(clientX, window.innerWidth, fromRight, edgeOffset));
    },
    [applyWidth, fromRight, edgeOffset],
  );

  // Apply the stored/initial width when the root mounts.
  const applied = useRef(false);
  const ensureApplied = useCallback(() => {
    if (applied.current || !rootRef.current) return;
    applied.current = true;
    applyWidth(width.current);
  }, [applyWidth, rootRef]);

  useEffect(() => {
    ensureApplied();
  }, [ensureApplied]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      ensureApplied();
      event.preventDefault();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      setDragging(true);

      const move = (ev: PointerEvent) => {
        applyFromPointer(ev.clientX);
      };
      const up = (ev: PointerEvent) => {
        target.releasePointerCapture(ev.pointerId);
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        setDragging(false);
        writeStoredWidth(storageKey, width.current);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
    },
    [applyFromPointer, ensureApplied, storageKey],
  );

  return { onPointerDown, dragging };
}