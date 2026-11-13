"use client";

import { useEffect, useState } from "react";
import { ToggleRow } from "../toggle-row";

// The beta opt-in lives in its own localStorage key, not in the preferences
// row (§9.7 has no field for it — D40).
const BETA_KEY = "spektrum_beta_opt_in_v1";

export function BetaSection() {
  const [optIn, setOptIn] = useState(false);

  useEffect(() => {
    setOptIn(localStorage.getItem(BETA_KEY) === "true");
  }, []);

  const toggle = (v: boolean) => {
    setOptIn(v);
    if (v) {
      localStorage.setItem(BETA_KEY, "true");
    } else {
      localStorage.removeItem(BETA_KEY);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <ToggleRow
        label="Join the beta program"
        description="Get early access to Prism features that are still in development."
        checked={optIn}
        onChange={toggle}
      />
      <div className="rounded-xl border border-[color:var(--border-outline)] bg-bg-app px-4 py-3 text-sm text-text-editor-secondary">
        Beta features may change or be removed. Some features are released gradually, even
        after you opt in.
      </div>
    </div>
  );
}