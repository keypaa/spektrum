"use client";

import type { ReactNode } from "react";
import {
  IconBeta,
  IconBraces,
  IconClose,
  IconDatabase,
  IconFile,
  IconFolder,
  IconIntegrations,
} from "@spektrum/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@spektrum/ui";
import { EditorSection } from "./sections/editor-section";
import { PdfViewerSection } from "./sections/pdf-viewer-section";
import { FileManagementSection } from "./sections/file-management-section";
import { DataControlsSection } from "./sections/data-controls-section";
import { BetaSection } from "./sections/beta-section";
import { IntegrationsSection } from "./sections/integrations-section";

export type SettingsSection =
  | "editor"
  | "pdf-viewer"
  | "file-management"
  | "data-controls"
  | "beta"
  | "integrations";

const NAV: Array<{ id: SettingsSection; label: string; icon: ReactNode }> = [
  { id: "editor", label: "Editor", icon: <IconBraces size={16} /> },
  { id: "pdf-viewer", label: "PDF Viewer", icon: <IconFile size={16} /> },
  { id: "file-management", label: "File Management", icon: <IconFolder size={16} /> },
  { id: "data-controls", label: "Data Controls", icon: <IconDatabase size={16} /> },
  { id: "beta", label: "Beta features", icon: <IconBeta size={16} /> },
  { id: "integrations", label: "Integrations", icon: <IconIntegrations size={16} /> },
];

const SECTION_COMPONENTS: Record<SettingsSection, () => ReactNode> = {
  editor: EditorSection,
  "pdf-viewer": PdfViewerSection,
  "file-management": FileManagementSection,
  "data-controls": DataControlsSection,
  beta: BetaSection,
  integrations: IntegrationsSection,
};

export function SettingsModal({
  open,
  section,
  onSectionChange,
  onOpenChange,
}: {
  open: boolean;
  section: SettingsSection;
  onSectionChange(section: SettingsSection): void;
  onOpenChange(open: boolean): void;
}) {
  const Section = SECTION_COMPONENTS[section];
  const current = NAV.find((n) => n.id === section) ?? NAV[0]!;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[720px] max-w-[960px] gap-0 overflow-hidden rounded-2xl bg-modal-bg p-0">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Editor, PDF, file management, data, beta and integration preferences.
        </DialogDescription>
        <div className="flex h-full min-h-0">
          {/* Left nav: 240 px on --bg-app. */}
          <nav
            aria-label="Settings sections"
            className="flex w-[240px] flex-none flex-col gap-0.5 overflow-y-auto bg-bg-app p-3"
          >
            {NAV.map((item) => {
              const active = item.id === section;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSectionChange(item.id)}
                  className={`flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs transition-colors ${
                    active
                      ? "bg-nav-bg-active text-text-nav-primary"
                      : "text-text-nav-tertiary hover:text-text-nav-primary"
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Content pane. */}
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-modal-bg p-8">
            <div className="mx-auto flex max-w-2xl flex-col gap-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-normal text-text-editor-primary">{current.label}</h2>
                <button
                  type="button"
                  aria-label="Close settings"
                  onClick={() => onOpenChange(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-text-editor-secondary hover:bg-nav-bg-hover hover:text-text-editor-primary"
                >
                  <IconClose size={16} />
                </button>
              </div>
              <Section />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}