"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconUpload } from "@spektrum/ui/icons";

// Keep in sync with MAX_UPLOAD_BYTES.workspace on the server; that module is
// server-only, so the browser guard uses a local constant. Oversized files are
// never signed/PUT to R2 — uploadDocumentsRequest sends the rest by key.
const MAX_WORKSPACE_FILE_BYTES = 30 * 1024 * 1024;

/**
 * Window-wide drag target for file uploads.
 *
 * A depth counter (rather than a boolean) keeps the overlay from flickering as
 * the cursor crosses child elements: every dragenter is paired with a
 * dragleave, and only the last leave hides the cue. The overlay itself is
 * pointer-events-none so the drop event still reaches the window listener.
 */
export function FileDropOverlay({
  onFiles,
}: {
  onFiles(files: File[]): void;
}) {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  useEffect(() => {
    const hasFiles = (event: DragEvent): boolean =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setActive(true);
    };
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setActive(false);
      const files = Array.from(event.dataTransfer?.files ?? []).filter(
        (file) => file.size <= MAX_WORKSPACE_FILE_BYTES,
      );
      if (files.length > 0) onFilesRef.current(files);
    };

    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  const stop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  if (!active) return null;

  return (
    <div
      data-testid="file-drop-overlay"
      aria-hidden="true"
      onDragEnter={stop}
      onDragOver={stop}
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[color:var(--border-brand)] bg-bg-code px-12 py-10 shadow-2xl">
        <IconUpload size={28} />
        <p className="text-sm font-medium text-text-editor-primary">
          Drop files to upload
        </p>
        <p className="text-xs text-text-editor-secondary">
          Added to this project&apos;s files (up to 30 MB each)
        </p>
      </div>
    </div>
  );
}
