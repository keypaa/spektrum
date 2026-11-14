"use client";

import { IconClose, IconLink } from "@spektrum/ui/icons";

export function ShareDialog({
  open,
  projectName,
  onClose,
}: {
  open: boolean;
  projectName: string;
  onClose: () => void;
}): React.ReactElement | null {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-label={`Share "${projectName}"`}
        className="w-[480px] rounded-2xl bg-modal-bg p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Share &quot;{projectName}&quot;</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            <IconClose size={16} />
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            aria-label="Email"
            placeholder="Email"
            className="h-9 flex-1 rounded-md border border-[color:var(--border-log)] bg-transparent px-2 text-sm"
          />
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="h-9 rounded-full bg-button-primary-bg px-4 text-sm text-button-primary-text opacity-50"
          >
            Invite
          </button>
        </div>
        <p className="mt-1 text-xs text-fg-tertiary">Sharing arrives in v2</p>

        <h3 className="mt-4 text-sm font-medium">People with access</h3>
        <div className="mt-2 text-sm text-fg-tertiary">No people yet</div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span>General access</span>
          <select
            aria-label="General access"
            disabled
            className="h-8 rounded-md border border-[color:var(--border-log)] bg-transparent px-2 text-sm"
          >
            <option>Only invited users</option>
          </select>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(window.location.href);
            }}
            className="flex h-9 items-center gap-2 rounded-full border border-[color:var(--border-log)] px-3 text-sm"
          >
            <IconLink size={14} />
            Copy link
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-full bg-button-primary-bg px-4 text-sm text-button-primary-text"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}