// SyncTeX backward sync: a PDF double-click → the nearest anchor → the editor
// line (spec §8.2). Lines are 1-based per file (spec §11.6).

export interface Anchor {
  y: number;
  path: string;
  line: number;
}

/** The anchor nearest to `y`, or null when the page has none. */
export function nearestAnchor(
  anchors: Anchor[],
  y: number,
): Anchor | null {
  let best: Anchor | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    const distance = Math.abs(anchor.y - y);
    if (distance < bestDistance) {
      best = anchor;
      bestDistance = distance;
    }
  }
  return best;
}