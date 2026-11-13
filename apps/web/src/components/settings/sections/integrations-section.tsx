"use client";

export function IntegrationsSection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-[color:var(--border-outline)] bg-bg-app px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="text-base font-normal text-text-editor-primary">Zotero</div>
            <div className="text-sm text-text-editor-secondary">
              With the Zotero integration, you can import your references into your project.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-editor-tertiary">Coming soon</span>
            <button
              type="button"
              aria-disabled="true"
              className="h-8 cursor-not-allowed rounded-lg bg-[color:var(--button-secondary-bg)] px-3 text-sm text-[color:var(--button-secondary-text)] opacity-50"
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}