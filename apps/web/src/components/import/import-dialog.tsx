"use client";

import { useState } from "react";
import {
  Dialog,
  DialogAction,
  DialogCancel,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@spektrum/ui";

export type ImportReport = {
  projects: number;
  files: number;
  rewrittenPaths: number;
  promotedMains: number;
  conversationsImported: number;
  conversationsSkipped: number;
  rejectedPaths: string[];
  skipped: Array<{ project: string; reason: string }>;
};

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

const ERROR_COPY: Record<string, string> = {
  unauthorized: "You are not signed in.",
  forbidden: "This archive could not be imported.",
  too_large: "That archive is too large. The limit is 30 MB.",
  rate_limited: "You are importing too often. Try again in a minute.",
  bad_request: "That file is not a Prism archive.",
};

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!file || pending) return;
    setPending(true);
    setError(null);
    setReport(null);
    try {
      const form = new FormData();
      form.append("archive", file);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as {
        report?: ImportReport;
        error?: string;
        message?: string;
      };
      if (!res.ok || !body.report) {
        setError(
          body.message ??
            ERROR_COPY[body.error ?? ""] ??
            `Import failed (${res.status}).`,
        );
        return;
      }
      setReport(body.report);
    } catch {
      setError("Import failed. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import archive</DialogTitle>
          <DialogDescription>
            Import a Prism export (.zip). Existing projects are never
            overwritten.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="import-archive"
            className="text-sm text-text-editor-secondary"
          >
            Archive (.zip)
          </label>
          <input
            id="import-archive"
            className="text-sm"
            type="file"
            accept=".zip"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {report ? (
          <div className="flex flex-col gap-1 text-sm text-text-editor-primary">
            <div>{plural(report.projects, "project")} imported</div>
            <div>{plural(report.files, "file")}</div>
            <div>
              {plural(report.conversationsImported, "conversation")} imported
            </div>
            {report.conversationsSkipped > 0 ? (
              <div>
                {plural(report.conversationsSkipped, "conversation")} skipped
              </div>
            ) : null}
            {report.rejectedPaths.length > 0 ? (
              <div>
                {plural(report.rejectedPaths.length, "path")} rejected
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="text-sm text-text-editor-secondary">{error}</div>
        ) : null}

        <DialogFooter>
          <DialogCancel
            disabled={pending}
            onClick={() => {
              setFile(null);
              setReport(null);
              setError(null);
            }}
          >
            Cancel
          </DialogCancel>
          <DialogAction
            disabled={pending || !file}
            onClick={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            Import
          </DialogAction>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}