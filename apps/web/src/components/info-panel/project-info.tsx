"use client";

import type { ProjectStats } from "@spektrum/shared/compile";

const CARDS: Array<[keyof ProjectStats, string]> = [
  ["words", "Words"],
  ["wordsInText", "Words in Text"],
  ["wordsInHeaders", "Words in Headers"],
  ["wordsOutsideText", "Words outside text"],
  ["headers", "Number of headers"],
  ["figures", "Number of figures"],
  ["mathInline", "Number of math inlines"],
  ["mathDisplay", "Number of math displayed"],
];

export function ProjectInfo({
  stats,
}: {
  stats: ProjectStats | null;
}): React.ReactElement {
  return (
    <div className="p-4">
      <h2 className="text-sm font-medium">Summary</h2>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {CARDS.map(([key, label]) => (
          <div
            key={key}
            className="rounded-lg bg-bg-sidepanel-secondary p-3"
          >
            <div className="text-[11px] leading-4 text-fg-tertiary">
              {label}
            </div>
            <div className="text-xl leading-7">{stats?.[key] ?? 0}</div>
          </div>
        ))}
      </div>
    </div>
  );
}