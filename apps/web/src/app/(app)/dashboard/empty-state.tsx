"use client";

import { Button } from "@spektrum/ui";
import { createBlankProject } from "@/lib/actions";

export function EmptyState() {
  return (
    <div
      data-testid="project-empty-state"
      className="flex w-full flex-col items-center justify-center gap-2 text-center"
    >
      {/* The 100 px spacer is what places the group in ref 43 — keep it. */}
      <div className="h-[100px] w-px" aria-hidden="true" />
      <div className="mb-2 text-base text-text-nav-primary">
        You don&apos;t have any projects yet
      </div>
      <div className="text-sm font-light text-text-nav-tertiary">
        Start with a hosted project on Prism
      </div>
      {/* m-4 + px-4 py-2 text-sm font-light = the 149×36 CSS pill in ref 43. */}
      <Button size="sm" className="m-4 h-9 px-4 font-light" onClick={() => void createBlankProject()}>
        Start from Scratch
      </Button>
      <div className="h-[150px] w-px" aria-hidden="true" />
    </div>
  );
}
