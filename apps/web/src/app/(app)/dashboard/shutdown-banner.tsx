"use client";

import { Button } from "@spektrum/ui";
import { IconClose, IconDownload, IconWarning } from "@spektrum/ui/icons";

export function ShutdownBanner({ onClose }: { onClose: () => void }) {
  return (
    <section
      aria-labelledby="shutdown-banner-title"
      data-testid="shutdown-banner"
      className="relative flex items-start gap-2 rounded-lg border border-notification-border-warning/25 bg-fg-warning/10 px-3 py-2 pr-11 sm:items-center"
    >
      <IconWarning
        aria-hidden="true"
        size={18}
        className="mt-0.5 shrink-0 text-tools-text-warning sm:mt-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="min-w-0 text-sm leading-5">
          <h2 id="shutdown-banner-title" className="inline font-semibold text-text-editor-primary">
            Prism will shut down on January 1, 2027.
          </h2>{" "}
          <p className="inline text-text-editor-secondary">
            Export your Prism projects before the shutdown date to keep a copy of your files.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            className="h-auto min-h-8 py-1.5 leading-snug"
          >
            <IconDownload size={16} />
            Open export settings
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-auto min-h-8 border border-border-outline bg-modal-bg py-1.5 leading-snug"
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
        className="absolute right-2 top-2 h-8 w-8 px-0 text-text-editor-secondary sm:top-1/2 sm:-translate-y-1/2"
      >
        <IconClose size={16} />
      </Button>
    </section>
  );
}
