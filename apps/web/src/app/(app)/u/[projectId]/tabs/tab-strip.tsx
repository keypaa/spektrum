"use client";

import type { ReactElement, ReactNode } from "react";
import {
  IconClose,
  IconPanelLeftClose,
  IconRefresh,
} from "@spektrum/ui/icons";
import type { DocumentKind } from "@/lib/documents";
import { kindIcon } from "../sidebar/project-sidebar";

export interface TabStripProps {
  tabs: { path: string; kind: DocumentKind }[];
  active: string | null;
  onActivate(path: string): void;
  onClose(path: string): void;
  onCollapseSidebar(): void;
  onRecompile(): void;
  tools: ReactNode;
}

export function TabStrip({
  tabs,
  active,
  onActivate,
  onClose,
  onCollapseSidebar,
  onRecompile,
  tools,
}: TabStripProps): ReactElement {
  return (
    <div
      data-testid="tab-strip"
      className="flex h-16 min-w-0 items-center gap-2 border-b-2 border-[color:var(--border-log)] bg-bg-code px-4"
    >
      <button
        type="button"
        aria-label="Collapse sidebar"
        onClick={onCollapseSidebar}
        className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-text-editor-secondary hover:bg-[color:var(--nav-bg-hover-strong)] hover:text-text-editor-primary"
      >
        <IconPanelLeftClose size={16} />
      </button>
      <button
        type="button"
        aria-label="Recompile"
        onClick={onRecompile}
        className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-text-editor-secondary hover:bg-[color:var(--nav-bg-hover-strong)] hover:text-text-editor-primary"
      >
        <IconRefresh size={16} />
      </button>
      <div
        role="tablist"
        className="flex h-full min-w-0 flex-1 items-stretch gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const isActive = tab.path === active;
          const Icon = kindIcon(tab.kind);
          return (
            <div
              key={tab.path}
              data-testid={`tab-${tab.path}`}
              role="tab"
              aria-selected={isActive}
              onClick={() => onActivate(tab.path)}
              onAuxClick={(e) => {
                // Middle-click closes, like a browser tab.
                if (e.button === 1) {
                  e.preventDefault();
                  onClose(tab.path);
                }
              }}
              className={`group relative flex h-10 min-w-0 max-w-[200px] cursor-pointer items-center gap-2 rounded-t-lg px-3 pt-1.5 text-xs ${
                isActive
                  ? "border-t-2 border-[color:var(--border-brand)] bg-bg-code text-text-editor-primary"
                  : "bg-transparent text-text-editor-secondary hover:bg-[color:var(--nav-bg-hover-strong)] hover:text-text-editor-primary"
              }`}
            >
              <Icon size={14} className="flex-none" />
              <span className="min-w-0 flex-1 truncate">{tab.path}</span>
              <button
                type="button"
                aria-label={`Close ${tab.path}`}
                className="flex h-4 w-4 flex-none items-center justify-center rounded text-text-editor-tertiary opacity-0 transition-opacity hover:text-text-editor-primary focus-visible:opacity-100 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.path);
                }}
              >
                <IconClose size={12} />
              </button>
            </div>
          );
        })}
      </div>
      {tools}
    </div>
  );
}