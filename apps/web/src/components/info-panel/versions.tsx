"use client";

import type { SnapshotRow } from "@spektrum/db/snapshots";

function relative(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  return date.toLocaleDateString();
}

export function Versions({
  rows,
  onRestore,
}: {
  rows: SnapshotRow[];
  onRestore: (batchId: string) => void;
}): React.ReactElement {
  const batches = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const key = row.batchId ?? row.id;
    const list = batches.get(key) ?? [];
    list.push(row);
    batches.set(key, list);
  }
  const entries = [...batches.entries()];

  return (
    <div className="p-2">
      {entries.length === 0 ? (
        <p className="p-4 text-sm text-fg-tertiary">No versions yet</p>
      ) : (
        entries.map(([batchId, list]) => (
          <div
            key={batchId}
            className="flex items-center gap-2 border-b border-[color:var(--border-log)] py-2"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded bg-bg-sidepanel-secondary text-[10px] text-fg-tertiary">
              PDF
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">Edited workspace</div>
              <div className="text-xs text-fg-tertiary">
                {relative(list[0]!.createdAt)} · {list[0]!.author}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRestore(batchId)}
              className="text-xs text-fg-tertiary"
            >
              Restore
            </button>
          </div>
        ))
      )}
      <div className="p-2 text-xs text-fg-tertiary">
        Showing {entries.length} version{entries.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}