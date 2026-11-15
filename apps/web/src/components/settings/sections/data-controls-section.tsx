"use client";

export function DataControlsSection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-base font-normal text-text-editor-primary">
        Export all projects (zip)
      </div>
      {/* A plain navigation: the browser follows the location, so the
          Content-Disposition of the response is the download's file name. */}
      <button
        type="button"
        className="h-8 w-fit rounded-lg bg-[color:var(--button-secondary-bg)] px-3 text-sm text-[color:var(--button-secondary-text)]"
        onClick={() => {
          window.location.href = "/api/projects/export";
        }}
      >
        Download zip
      </button>
      <div className="text-sm text-text-editor-secondary">
        Import is available from the dashboard Import menu.
      </div>
    </div>
  );
}