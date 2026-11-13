"use client";

export function DataControlsSection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-base font-normal text-text-editor-primary">
        Export all projects (zip)
      </div>
      <button
        type="button"
        aria-disabled="true"
        className="h-8 w-fit cursor-not-allowed rounded-lg bg-[color:var(--button-secondary-bg)] px-3 text-sm text-[color:var(--button-secondary-text)] opacity-50"
      >
        Download zip
      </button>
      <div className="text-sm text-text-editor-secondary">
        Import and export arrive in Phase 5.
      </div>
    </div>
  );
}