"use client";

import { Button } from "@spektrum/ui";
import { IconClose, IconDownload, IconWarning } from "@spektrum/ui/icons";

export function ShutdownBanner({ onClose }: { onClose: () => void }) {
  return (
    <section
      aria-labelledby="shutdown-banner-title"
      data-testid="shutdown-banner"
      className="relative flex h-[50px] items-center gap-2 rounded-lg border border-notification-border-warning/25 bg-fg-warning/10 px-3 pr-10"
    >
      <IconWarning
        aria-hidden="true"
        size={18}
        className="shrink-0 text-tools-text-warning"
      />
      <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
        <div className="min-w-0 whitespace-nowrap text-sm leading-5">
          <h2 id="shutdown-banner-title" className="inline font-semibold text-text-editor-primary">
            Prism will shut down on January 1, 2027.
          </h2>{" "}
          <p className="inline text-text-editor-secondary dark:text-[color:var(--neutral-200)]">
            Export your Prism projects before the shutdown date to keep a copy of your files.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            className="h-8 gap-1 px-2.5"
          >
            <IconDownload size={16} />
            Open export settings
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-8 border border-border-outline bg-modal-bg px-3"
          >
            Migration guide
          </Button>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 px-0 text-text-editor-secondary"
      >
        <IconClose size={16} />
      </Button>
    </section>
  );
}
