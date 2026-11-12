import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import type { Page } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const REF_DIR = join(HERE, "..", "baselines", "reference");
const ARTIFACT_DIR = join(HERE, "artifacts");

/** App region inside the 2530x1380 reference capture, in physical pixels. */
export const APP_REGION = { x: 64, y: 53, width: 2466, height: 1327 } as const;

export interface Mask {
  /** Full-capture physical coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
}

// The settings modal as measured in `21-22-51`: x 753-1838, y 309-1124
// (1085x815 physical = 960x721 CSS at DSF 1.13).
const SETTINGS_MODAL = { x: 753, y: 309, width: 1085, height: 815 } as const;

/** Per-baseline masks. Rectangles are full-capture physical coordinates as
 *  `{x, y, width, height}`; translated into app-region space at load time.
 *  See e2e/baselines/README.md for why each rectangle exists. */
const MASKS: Record<string, Mask[]> = {
  // Chrome's "Screenshot saved and copied" toast (x 2107-2529, y 0-111) sits
  // over the dark capture's top-right header; only its part below y=53 is
  // inside the app region.
  "dashboard--dark": [
    { x: 2100, y: 0, width: 430, height: 115 },
    { x: 100, y: 174, width: 70, height: 1123 },
  ],
  // The banner pushes the list down 55 physical px.
  "dashboard--dark--banner": [{ x: 100, y: 240, width: 70, height: 1057 }],
  "dashboard--dark--import-menu": [{ x: 100, y: 174, width: 70, height: 1123 }],
  "dashboard--dark--new-menu": [{ x: 100, y: 174, width: 70, height: 1123 }],
  "dashboard--dark--new-folder-dialog": [{ x: 100, y: 174, width: 70, height: 1123 }],
  "dashboard--light": [{ x: 100, y: 174, width: 70, height: 1123 }],
  "dashboard--light--row-menu": [{ x: 100, y: 174, width: 70, height: 1123 }],
  // Signed-out capture: mask the `Sign in` chip in the bottom-left corner.
  "dashboard--light--empty--banner": [{ x: 64, y: 1290, width: 296, height: 90 }],
  // Settings (Phase 2): everything outside the 960x720 modal is a blurred
  // screenshot of Prism's dashboard; mask it. The OS toast (x 2107-2529,
  // y 0-111) falls inside the top strip, so the four strips already cover it —
  // do not add a fifth rect. Strips are disjoint: maskPng counts every
  // rectangle independently, so an overlap would inflate `masked`.
  // Coordinates are full-capture physical; maskPng subtracts APP_REGION.
  "settings--editor--dark": outsideModal(),
  "settings--pdf-viewer--dark": outsideModal(),
  "settings--file-management--dark": outsideModal(),
  "settings--data-controls--dark": outsideModal(),
  "settings--beta--dark": outsideModal(),
  "settings--integrations--dark": outsideModal(),
  // Neither editor capture contains the "Screenshot saved" toast (verified by
  // sampling x 2050-2530, y 0-120: chrome toolbar, then app header/PDF). An
  // empty mask is correct; a toast rect here would blank the real header and
  // PDF top.
  "editor--dark--blank": [],
  "editor--light--blank": [],
};

/** Four non-overlapping strips covering everything outside the modal. */
function outsideModal(): Mask[] {
  const m = SETTINGS_MODAL;
  return [
    { x: 0, y: 0, width: 2530, height: m.y }, // top
    { x: 0, y: m.y + m.height, width: 2530, height: 1380 - (m.y + m.height) }, // bottom
    { x: 0, y: m.y, width: m.x, height: m.height }, // left of modal
    { x: m.x + m.width, y: m.y, width: 2530 - (m.x + m.width), height: m.height }, // right of modal
  ];
}

function cropToAppRegion(png: PNG): PNG {
  const out = new PNG({ width: APP_REGION.width, height: APP_REGION.height });
  PNG.bitblt(png, out, APP_REGION.x, APP_REGION.y, APP_REGION.width, APP_REGION.height, 0, 0);
  return out;
}

function maskPng(png: PNG, masks: Mask[]): number {
  let masked = 0;
  for (const m of masks) {
    const x0 = Math.max(0, Math.round(m.x - APP_REGION.x));
    const y0 = Math.max(0, Math.round(m.y - APP_REGION.y));
    const x1 = Math.min(png.width, Math.round(m.x + m.width - APP_REGION.x));
    const y1 = Math.min(png.height, Math.round(m.y + m.height - APP_REGION.y));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (png.width * y + x) << 2;
        png.data[i] = 0;
        png.data[i + 1] = 0;
        png.data[i + 2] = 0;
        png.data[i + 3] = 0;
        masked++;
      }
    }
  }
  return masked;
}

export interface CompareResult {
  name: string;
  total: number;
  masked: number;
  differing: number;
  ratio: number;
  artifactDir: string;
}

export async function compareAgainstReference(
  page: Page,
  name: string,
): Promise<CompareResult> {
  const reference = cropToAppRegion(
    PNG.sync.read(readFileSync(join(REF_DIR, `${name}.png`))),
  );
  // The dialog is Radix-portaled to <body>, outside `[data-testid="app-root"]`,
  // so element screenshots would miss it. A full-viewport screenshot captures the
  // same 2182×1174 CSS app region (2466×1327 at DSF 1.13) including portals.
  const screenshot = await page.screenshot();
  const shot = PNG.sync.read(Buffer.from(screenshot));
  // DSF 1.13 turns 2182x1174 CSS into 2465.7x1326.6 physical, so the element
  // screenshot can come back one pixel larger than the reference. Cropping from
  // the top-left is safe (the app root is anchored there) and never rescales.
  // If Chromium rounds *down* instead, bump the viewport to 2183x1175 (Task 3
  // runs this once and records the working pair in e2e/baselines/README.md).
  if (shot.width < reference.width || shot.height < reference.height) {
    throw new Error(
      `${name}: screenshot ${shot.width}x${shot.height} is smaller than the ` +
        `reference ${reference.width}x${reference.height}; raise the viewport`,
    );
  }
  const actual = new PNG({ width: reference.width, height: reference.height });
  PNG.bitblt(shot, actual, 0, 0, reference.width, reference.height, 0, 0);

  const masks = MASKS[name] ?? [];
  const masked = maskPng(reference, masks);
  maskPng(actual, masks);

  const diff = new PNG({ width: reference.width, height: reference.height });
  const differing = pixelmatch(
    reference.data,
    actual.data,
    diff.data,
    reference.width,
    reference.height,
    { threshold: 0.1 },
  );
  const total = reference.width * reference.height;

  const artifactDir = join(ARTIFACT_DIR, name);
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, "actual.png"), PNG.sync.write(actual));
  writeFileSync(join(artifactDir, "diff.png"), PNG.sync.write(diff));

  // The budget is a share of the *compared* pixels: masked pixels are excluded
  // from the denominator so adding masks can never buy head-room.
  return {
    name,
    total,
    masked,
    differing,
    ratio: differing / (total - masked),
    artifactDir,
  };
}

export const VISUAL_BUDGET = 0.0015; // 0.15 %
