// SyncTeX text format → the compact map the viewer uses (spec §11.6).
//
// The `.synctex.gz` has no page size: the caller passes the page boxes
// (from the PDF's MediaBox). Coordinates are sp → TeX pt (÷65536) → PDF bp
// (×72/72.27) → page-relative fractions, with y measured from the top.

import { gunzipSync } from "node:zlib";
import type { SyncTexMap } from "@spektrum/shared";

export interface PageBox {
  width: number;
  height: number;
}

const SP_PER_PT = 65536;
const BP_PER_PT = 72 / 72.27;

function projectPath(input: string): string | null {
  const unified = input.replace(/\\/g, "/");
  const underWork = /^\/work\/(?:\.\/)?(.*)$/.exec(unified);
  if (!underWork) return null; // package files are not project documents
  return underWork[1]!.replace(/^\.\//, "");
}

export function parseSyncTex(
  gz: Buffer,
  pages: PageBox[],
): SyncTexMap {
  const text = gunzipSync(gz).toString("utf8");
  const inputs = new Map<number, string>();
  const forward: SyncTexMap["forward"] = {};
  const backward: SyncTexMap["backward"] = [];
  let page = 0;
  let inContent = false;

  for (const raw of text.split("\n")) {
    if (raw.startsWith("Input:")) {
      const m = /^Input:(\d+):(.*)$/.exec(raw);
      if (m) inputs.set(Number(m[1]), m[2]!);
      continue;
    }
    if (raw === "Content:") {
      inContent = true;
      continue;
    }
    if (!inContent) continue;

    const pageStart = /^\{(\d+)/.exec(raw);
    if (pageStart) {
      page = Number(pageStart[1]);
      if (!backward[page - 1]) backward[page - 1] = { page, anchors: [] };
      continue;
    }

    const m = /^[\[(]?([hvxkg]?)(\d+),(\d+):(-?\d+),(-?\d+)/.exec(raw);
    if (!m) continue;
    const tag = Number(m[2]);
    const line = Number(m[3]);
    const path = inputs.get(tag);
    if (!path) continue;
    const project = projectPath(path);
    if (!project) continue;
    const size = pages[page - 1];
    if (!size) continue;

    const x = ((Number(m[4]) / SP_PER_PT) * BP_PER_PT) / size.width;
    const y = ((Number(m[5]) / SP_PER_PT) * BP_PER_PT) / size.height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    (forward[project] ??= []).push({ line, page, x, y });
    const pageBack = backward[page - 1];
    if (pageBack) pageBack.anchors.push({ y, path: project, line });
  }

  for (const entries of Object.values(forward)) {
    entries.sort((a, b) => a.line - b.line || a.x - b.x);
  }
  for (const pageBack of backward) {
    pageBack.anchors.sort((a, b) => a.y - b.y);
  }

  return { forward, backward };
}