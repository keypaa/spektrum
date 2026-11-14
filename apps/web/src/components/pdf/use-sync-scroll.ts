// SyncTeX forward sync: the editor cursor → the PDF page (spec §8.2).

export interface ForwardEntry {
  line: number;
  page: number;
  x: number;
  y: number;
}

/** The forward entry nearest to the cursor line, or null. */
export function nearestForward(
  entries: ForwardEntry[] | undefined,
  line: number,
): ForwardEntry | null {
  if (!entries || entries.length === 0) return null;
  let best = entries[0]!;
  let bestDistance = Math.abs(best.line - line);
  for (const entry of entries) {
    const distance = Math.abs(entry.line - line);
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best;
}