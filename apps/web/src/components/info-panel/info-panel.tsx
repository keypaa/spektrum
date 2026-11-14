"use client";

// The Info panel shell (spec §9): four tabs, 44 px, a close button, and the
// active tab's content. The right pane shows exactly one of the PDF or this
// panel (spec §6.3), switched from the Tools menu.

import { useEffect } from "react";
import { IconClose } from "@spektrum/ui/icons";

export const INFO_TABS = [
  "Project Info",
  "Versions",
  "Comments",
  "Logs",
] as const;

export type InfoTab = (typeof INFO_TABS)[number];

export interface InfoPanelProps {
  tab: InfoTab;
  onTab: (tab: InfoTab) => void;
  onClose: () => void;
  children: React.ReactNode;
}

export function InfoPanel({
  tab,
  onTab,
  onClose,
  children,
}: InfoPanelProps): React.ReactElement {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      data-testid="info-panel"
      className="flex h-full min-h-0 flex-col bg-bg-preview"
    >
      <div
        role="tablist"
        aria-label="Info panel"
        className="flex h-11 flex-none items-center gap-1 border-b border-[color:var(--border-log)] px-2"
      >
        {INFO_TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={name === tab}
            onClick={() => onTab(name)}
            className={`h-11 border-b-2 px-2 text-sm ${
              name === tab
                ? "border-[color:var(--border-brand)] text-fg-primary"
                : "border-transparent text-fg-tertiary"
            }`}
          >
            {name}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center"
        >
          <IconClose size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}