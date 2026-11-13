"use client";

import { usePreferences } from "@/components/preferences-provider";
import { ToggleRow } from "../toggle-row";

export function PdfViewerSection() {
  const { preferences, setPreference } = usePreferences();
  return (
    <div className="flex flex-col">
      <ToggleRow
        label="PDF Dark Mode"
        description='Enable "Dark Mode" for the PDF viewer by inverting the colors.'
        checked={preferences.pdfDarkMode}
        onChange={(v) => setPreference("pdfDarkMode", v)}
      />
      <ToggleRow
        label="PDF Zoom Shortcuts"
        description="Override the browser's zoom shortcuts (Cmd/Ctrl +/-/0) to zoom the PDF viewer instead."
        checked={preferences.pdfZoomShortcuts}
        onChange={(v) => setPreference("pdfZoomShortcuts", v)}
      />
    </div>
  );
}