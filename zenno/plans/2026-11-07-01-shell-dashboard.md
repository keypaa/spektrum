# Shell + Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the authenticated stub with the real Spektrum dashboard — the project shell, header controls, project list/grid, row menu, rename/new-folder dialogs, empty state, shutdown banner, account chip + menu, and theme switcher — matching the captured Prism dashboard pixel-for-pixel.

**Architecture:** `apps/web` is Next.js 16 (App Router, React Server Components + client islands). The dashboard route is a server component that authenticates, queries projects, and renders a client tree (`dashboard-client.tsx`) that owns all interactivity (search, sort, layout, menus, dialogs). Server actions in `apps/web/src/lib/actions.ts` mutate data. UI primitives (Button, Input, DropdownMenu, Dialog) live in `packages/ui` on Radix primitives; dashboard-specific composition lives in `apps/web`. All copy comes from the spec; all colour comes from `packages/ui/styles/tokens.css`.

**Tech Stack:** Node **26.13.0**, pnpm **12.18.0**, TypeScript **6.0.3** (`strict`), Next.js **16.4.5**, React **19.3.1**, Tailwind CSS **4.3.5**, Drizzle ORM **0.45.4**, Radix UI primitives, Playwright **1.65.0** + `pixelmatch` **8** + `pngjs` **7**.

**Read the Next.js docs first.** `apps/web/AGENTS.md` warns that this Next 16 has breaking changes and training knowledge is wrong. Before writing any Next.js code (first touched in Task 8), read the doc index in the repo-root `AGENTS.md` and the relevant guides under `apps/web/node_modules/next/dist/docs/` — especially `01-app/04-linking-and-navigating`, `01-app/07-mutating-data` (server actions), `01-app/15-route-handlers`, and `01-app/03-api-reference/04-functions` (`cookies`, `headers`, `redirect`, `revalidatePath`).

**Exit criteria:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e` all green; the visual suite (`pnpm test:visual`) reports **≤ 0.15 % differing pixels** against the eight references committed in Task 2 (screenshots 1, 12, 13, 14, 15, 39, 46, 54) with `pixelmatch` threshold 0.1; CI runs the visual suite and uploads diff artifacts.

---

## The five facts this plan is built on

Read these before touching code. Each one overrides the design spec, and each is backed by a measurement in `zenno/recon/`.

1. **There is no icon rail.** The dark strip at the left of every capture is Chrome's *vertical tab strip* (it shows Chrome's tab-search buttons and tab favicons, and it is byte-identical on the signed-out capture). Spec §6.1 is deleted. The dashboard is the full viewport width.
2. **The captures are 2530×1380 physical.** Chrome chrome occupies 64 px left and 53 px top, so the app region is **2466×1327 physical = 2182×1174 CSS at `deviceScaleFactor: 1.13`**. References are compared 1:1, with no rescaling.
3. **The account chip is below the card, not inside it.** The card ends ~76 CSS above the bottom of the viewport; the chip sits on the page background underneath.
4. **The card is inset 16 px left and ~8–10 px top/right.** Not the 16 px on all four sides the spec's ASCII implies.
5. **Delete is not red, and the row `⋯` is always visible.** The only row-menu capture (ref 46) shows three near-black items and no pointer arrow; the spec's `--fg-error` and hover-reveal wording are wrong.

A per-measurement table (physical → CSS) is in **Appendix A**. When the plan and Appendix A disagree with the spec, **Appendix A wins**; Task 1 writes that into the spec.

---

### Task 1: Amend the spec and the plan index

The spec is the authority on *what*, but four of its statements are contradicted by the primary visual evidence. Write the corrections into the spec first so every later task can cite the spec without caveats.

**Files:**
- Edit: `zenno/specs/2026-11-07-spektrum-design.md`
- Edit: `zenno/plans/README.md`

**Interfaces:**
- Consumes: nothing
- Produces: a spec whose §2.1, §2.5, §5.8, §6.1, §6.2, §6.3, §10.7, §15.1 and D4 match the captures; a plan index whose Phase 1 scope no longer mentions a rail

- [ ] **Step 1: Amend §2.1 — capture geometry**

Replace the "physical resolution 2530×1380 (CSS viewport ≈ 1918×1046, DPR ≈ 1.319)" paragraph with:

```markdown
Dark, 38 files, captured 2026-11-05 21:22–21:28, physical resolution **2530×1380**.
The browser chrome occupies **64 px left** (Chrome's vertical tab strip) and **53 px top**
(toolbar), so the app region is **2466×1327 physical = 2182×1174 CSS** at
`deviceScaleFactor: 1.13`. References are compared 1:1 — never rescaled.
```

- [ ] **Step 2: Amend §2.5 — supplemental geometry**

Apply the same wording to the supplemental table ("Same resolution (2530×1380)" → "Same app-region geometry: 2466×1327 physical = 2182×1174 CSS at DSF 1.13").

- [ ] **Step 3: Amend §5.8 — icon registry list**

Add the six icons Phase 1 needs to the list, and record why:

```markdown
IconSearch          IconChevronDown      IconChevronRight     IconChevronLeft
IconChevronExpand   IconGrid             IconList             IconSettings
IconPlus            IconFolder           IconFolderPlus       IconFileTex
IconFileBib         IconFileImage        IconFileCsv          IconChat
IconMoreHorizontal  IconRefresh          IconPanelLeftClose   IconTools
IconSend            IconStop             IconPaperclip        IconMic
IconSparkle         IconWarning          IconError            IconInfo
IconCheck           IconClose            IconZoomIn           IconZoomOut
IconFit             IconFullscreen       IconExternalLink     IconDownload
IconTrash           IconPencil           IconUpload           IconCopy
IconLink            IconSortAscending    IconSortDescending   IconSidebar
IconLock            IconEye              IconTerminal         IconArrowUp
IconArrowDown       IconKeyboard         IconFeedback         IconMail
IconLogOut          IconUser
```

Fourteen names in that list are new in Phase 1: `IconGrid`, `IconList`, `IconPlus`, `IconMoreHorizontal`, `IconSortAscending`, `IconSortDescending`, `IconChevronExpand`, `IconDownload`, `IconSettings`, `IconKeyboard`, `IconFeedback`, `IconMail`, `IconLogOut`, `IconUser`. (The first eight are the dashboard header/list; the last six are the account menu and chip, §10.7.) Also change the size line "20 px in the icon rail" → "16 px in the dashboard header and account chip" (the rail no longer exists).

- [ ] **Step 4: Amend §6.1 — delete the rail**

Delete the whole §6.1 section and replace it with:

```markdown
### 6.1 Global shell

There is **no icon rail**. The dashboard and the editor occupy the full viewport width.
The dark strip at the left of the reference captures is Chrome's vertical tab strip,
not application UI. The account chip lives at the bottom-left of the dashboard page,
below the project card (§6.2).
```

Renumber nothing else; §6.2 and §6.3 keep their numbers.

- [ ] **Step 5: Amend §6.2 — dashboard**

Rewrite §6.2 so it matches the captures. The replacement must state:

- Page background `--bg-app`; the page wrapper is `p-2` (8 px).
- The page wrapper is `h-screen flex flex-col p-2`. The card has **no border** (the captures show a plain white card on `#f1f1f1`), is `rounded-xl`, background `--dashboard-card-bg` (light `#ffffff`, dark `#27282980` = `#1f1f20` over the page), inset **16 px left** (`ml-2` inside the `p-2` wrapper) and **10 px top / 8 px right** (measured), `flex-1 min-h-0`, and its bottom edge sits above the account chip.
- Header: `px-5 py-3` around the 38 px controls, plus a 1 px `--project-list-divider` bottom border (the capture measures 70 physical = 62 CSS: 12+38+12+1).
  - Title `Your Projects`: 18 px, default line-height 28, **weight 600**, `--text-nav-primary`.
  - Search: exactly **300 px** wide (the capture measures 339 physical = 300 CSS), 38 px tall (`py-2` + `text-sm` + 2 borders), white in light / `--input-bg` (`#2a2a2a`) in dark, `IconSearch` 22 px at `start-3.5`, input `pl-12`, placeholder `Search` in `--text-editor-tertiary` (hidden on focus), border `--neutral-300` in light / `--search-input-border` in dark.
  - Segmented list/grid control: natural **78 px** track (2×30 px icon buttons with 18 px icons + `gap-2` + `p-1`, +2 px border in light), 38 px tall, `--input-bg`, `rounded-full`, active pill `--optionmenu-bg-hover`.
  - `Import`: secondary button, natural **100 CSS px** wide (113 physical), 36 px tall (`h-9`), text + `IconChevronDown` 16 px.
  - `New`: primary button, natural **109 CSS px** wide (123 physical), 36 px tall (`h-9`), `IconPlus` + text + `IconChevronDown`.
- Column header row: **34 px** tall (`py-2` + 18 px content), `px-5`, 12 px `--text-nav-secondary`; the 1 px divider below it belongs to the first row (`divide-y` on the list container), making the measured 40 physical between the two header dividers. Each header shows ONE 12 px indicator: inactive headers get `IconChevronExpand` in `--text-nav-tertiary`; the active header gets `IconSortAscending`/`IconSortDescending` in `--text-nav-secondary` (verified in ref 12: `Name` shows the stacked up-down glyph, `Created` shows a down chevron). Clicking a header sorts and flips direction; the header text brightens when active. A `w-[26px] h-[18px]` spacer after `Created` mirrors the `⋯` trigger's box (bundle `p8`).
- Rows: **57.6 physical px pitch = 51 CSS** (a 50 px row box — `py-2` menu cell + `p-2` trigger + 18 px icon — plus the 1 px `--project-list-divider` owned by `divide-y` on the list container); `px-5`; thumbnail **50×40** (list mode has no border/background on the thumbnail container — the grid card does); name **14 px / weight 400** `--text-nav-primary`; relative date **12 px / weight 300** `--text-nav-secondary`, right-aligned in a 80 px (`w-20`) column; `IconMoreHorizontal` **always visible** (not hover-gated), 18 px inside a `p-2` trigger (34×34), `--fg-tertiary`.
- Grid: `grid-cols-[repeat(auto-fill,minmax(128px,140px))] gap-x-4 gap-y-5 px-5 py-4`; card 148 px tall, thumbnail 88×68, name 13 px / weight 500.
- Empty state: copy unchanged — `You don't have any projects yet` (**16/24 `--text-nav-primary`**), `Start with a hosted project on Prism` (**14/20, weight 300, `--text-nav-tertiary`**), primary pill `Start from Scratch` (`py-2 px-4`, `text-sm`, weight 300, ≈149×36 CSS px). The group is **top-anchored**, not vertically centred: a 100 px spacer above the heading, `gap-2`, `mb-2` on the heading, `m-4` around the button, 150 px spacer below (bundle source + measured in ref 43).
- **Row `⋯` menu:** right-aligned, `sideOffset` 9 `align="end"` (bundle `hN`), `min-w-[200px]`, no pointer arrow, three items with no icons and no separators: `Rename`, `Duplicate`, `Delete`. `Delete` uses the same `--fg-primary`-family colour as the other two (the capture shows near-black, **not** `--fg-error`) because deletion is confirmed by the Versions panel, not a dialog.
- **Account chip:** *below* the card, aligned with the card's content inset (`ml-2 px-5`), avatar 28 px with the owner's initial, name 14 px / weight 500, `IconUser` 12 px + `Personal workspace` 12 px `--fg-tertiary`, `IconChevronExpand` 12 px. Opens the §10.7 menu upward.
- **Shutdown banner:** config flag `SHUTDOWN_BANNER`, default **off**. Rendered in a `px-2 pb-2 pt-2` wrapper: full width minus 8 px each side, **50 px** tall, `rounded-lg` with a 1 px **all-round** border, `px-3 py-2 pr-11`, background `bg-fg-warning/10`, border `border-notification-border-warning/25` (composites to light `#f2ead8` / border `#f6dca2`, dark `#2e2614` / border `#62480f`). Warning icon 18 px in `--tools-text-warning` (`#855600` light, `#ffe6b7` dark). Content: the exact copy (`text-sm leading-5`; title `font-semibold` in `--text-editor-primary`, description in `--text-editor-secondary`, both inline), then `Open export settings` (primary pill, `min-h-8 py-1.5`, `IconDownload`) and `Migration guide` (secondary pill, `border-border-outline bg-modal-bg`), then an absolutely positioned 32 px close button (`right-2`, vertically centred, `IconClose` 16 px). Dismissible; no margin of its own — the wrapper's `p-2` and the card's `mt-0.5` supply the spacing.

- [ ] **Step 6: Amend §6.3 — editor shell**

In the §6.3 ASCII diagram and the geometry table row "| Icon rail | 40 px, full height, `--bg-primary`, 1 px right border `--border-app` |", remove the rail column and the rail row. Add a note: "Phase 1 removed the rail (see §6.1); the editor plan re-states the remaining three-column layout."

- [ ] **Step 7: Amend §10.7 — account menu**

Replace with:

```markdown
### 10.7 Account menu

Avatar chip at the bottom-left of the dashboard page (below the project card), opening a
card upward: `Settings`, `Keyboard shortcuts`, `Give feedback`, `<email>`, `Sign out`.
Each row carries a 16 px prefix icon: `IconSettings`, `IconKeyboard`, `IconFeedback`,
`IconMail`, `IconLogOut`. (Prism's support/Discord rows are dropped.)
```

- [ ] **Step 8: Amend §15.1 — visual gate**

Replace the "Capture geometry" and "Procedure per screen" blocks with:

```markdown
**Capture geometry.** The references are 2530×1380 physical; the app region is
2466×1327 physical = 2182×1174 CSS at `deviceScaleFactor: 1.13`. The harness runs
Playwright at `viewport: { width: 2182, height: 1174 }`, `deviceScaleFactor: 1.13`, and
screenshots `[data-testid="app-root"]`. References are cropped to
`(64, 53, 2530, 1380)` and compared 1:1 — never rescaled.

**Masks.** Per-reference allow-list rectangles (physical pixels, full-capture
coordinates) are recorded in `e2e/baselines/README.md`. They cover the OS screenshot
toast and the row thumbnails, neither of which is reproducible. A masked pixel is
excluded from both images before diffing.

**Procedure per screen.**

1. Seed the fixture account and the deterministic project list (Appendix B).
2. Navigate, assert structural expectations (roles, texts, counts) *before* pixels.
3. Screenshot `[data-testid="app-root"]`.
4. Diff with `pixelmatch`: threshold 0.1, tolerance **0.15 % of differing pixels**.
5. Failures upload actual + highlighted-diff artefacts to CI.
```

- [ ] **Step 9: Amend the decision log**

In the §17 decision table, replace **D4** with:

```markdown
| D4 | Visual gate uses 2182×1174 CSS at DSF 1.13 against references cropped to the app region | The references are 2530×1380 with 64 px left / 53 px top of browser chrome; the app region is 2466×1327 physical = 2182×1174 CSS at DSF 1.13. Rescaling is never needed |
```

Add a new decision row:

```markdown
| D22 | No icon rail | The dark strip at the left of every capture is Chrome's vertical tab strip — it carries Chrome's tab-search buttons and tab favicons and is identical on the signed-out capture. Spec §6.1 deleted |
| D23 | The account chip sits below the project card, not inside it | Refs 12 and 39 show the card ending ~76 CSS above the viewport bottom with the chip on the page background underneath |
| D24 | Row-menu `Delete` is not red and `IconMoreHorizontal` is always visible | Ref 46 is the only row-menu capture: three near-black items, no pointer, and `⋯` on every row |
```

- [ ] **Step 10: Update the plan index**

In `zenno/plans/README.md`, change the Phase 1 row's scope from "Rail, dashboard, project rows, menus, dialogs, theme switcher, account menu" to "Dashboard shell, project rows, menus, dialogs, theme switcher component, account menu" and the exit criteria to "Visual diff vs dashboard references ≤ 0.15 %".

- [ ] **Step 11: Commit**

```bash
git add zenno/specs/2026-11-07-spektrum-design.md zenno/plans/README.md
git commit -m "docs(spec): align dashboard geometry, rail, and visual gate with captures"
```

---

### Task 2: Commit the reference baselines

The references are the only baseline. They are copied into the repo, named descriptively, and mapped in a README. Nothing is fetched at test time.

**Files:**
- Create: `e2e/baselines/reference/dashboard--dark.png` (from `21-24-40`)
- Create: `e2e/baselines/reference/dashboard--dark--banner.png` (from `21-22-28`)
- Create: `e2e/baselines/reference/dashboard--dark--import-menu.png` (from `21-24-49`)
- Create: `e2e/baselines/reference/dashboard--dark--new-menu.png` (from `21-24-53`)
- Create: `e2e/baselines/reference/dashboard--dark--new-folder-dialog.png` (from `21-25-10`)
- Create: `e2e/baselines/reference/dashboard--light.png` (from `21-01-02`)
- Create: `e2e/baselines/reference/dashboard--light--row-menu.png` (from `21-06-09`)
- Create: `e2e/baselines/reference/dashboard--light--empty--banner.png` (from `21-01-54`)
- Create: `e2e/baselines/README.md`

**Interfaces:**
- Consumes: Task 1
- Produces: eight reference PNGs at `e2e/baselines/reference/`, each 2530×1380, plus a README mapping them to spec rows and listing mask rectangles

- [ ] **Step 1: Copy the eight references**

From `~/Pictures/Screenshots/`, copy with the names above. Use the exact source files:

| Baseline | Source file | Theme / server | Fixture |
|---|---|---|---|
| `dashboard--dark.png` | `screenshot-2026-11-05_21-24-40-google-chrome.png` | dark, 3000 | `dark` |
| `dashboard--dark--banner.png` | `screenshot-2026-11-05_21-22-28-google-chrome.png` | dark, 3100 | `dark` |
| `dashboard--dark--import-menu.png` | `screenshot-2026-11-05_21-24-49-google-chrome.png` | dark, 3000 | `dark` |
| `dashboard--dark--new-menu.png` | `screenshot-2026-11-05_21-24-53-google-chrome.png` | dark, 3000 | `dark` |
| `dashboard--dark--new-folder-dialog.png` | `screenshot-2026-11-05_21-25-10-google-chrome.png` | dark, 3000 | `dark` |
| `dashboard--light.png` | `screenshot-2026-11-07_21-01-02-google-chrome.png` | light, 3000 | `light` |
| `dashboard--light--row-menu.png` | `screenshot-2026-11-07_21-06-09-google-chrome.png` | light, 3000 | `light` |
| `dashboard--light--empty--banner.png` | `screenshot-2026-11-07_21-01-54-google-chrome.png` | light, 3100 | `empty` |

Two candidates are deliberately **excluded**, and the README must say why:

- **No signed-in empty-state capture exists.** Both empty-state captures (`21-01-54`, `21-02-07`) are the **signed-out** dashboard: the bottom-left chip reads `Sign in` with the OpenAI mark, and `21-02-07` additionally has the account menu open. `21-01-54` (menu closed) is used, with the chip area masked; the signed-in chip itself is covered by ref 39 (`dashboard--light`). The spec's §2.1 rows 42/43 label these two files the wrong way round — Task 1 fixes the labels.
- **No dashboard account-menu capture exists.** The only user-menu capture is `21-25-52`, which is the **editor** (`Ready when you are!`, file tree, PDF), not the dashboard. Diffing it against the dashboard could never pass, so the account menu is verified behaviourally (Task 15) and by hand during Task 18; §15.1's gate lists `1, 12–15, 39, 46` and never included it.

The banner baselines run against the port-3100 server (`SHUTDOWN_BANNER=true`); `dashboard--light--empty--banner` doubles as the light-theme banner check, which ref 1 cannot provide.

- [ ] **Step 2: Verify dimensions and size**

```bash
python3 - <<'PY'
from PIL import Image
from pathlib import Path
for p in sorted(Path("e2e/baselines/reference").glob("*.png")):
    im = Image.open(p)
    print(p.name, im.size, f"{p.stat().st_size/2**20:.2f} MiB")
PY
```

Expected: every file is `(2530, 1380)`; total ≈ 14 MB.

- [ ] **Step 3: Write `e2e/baselines/README.md`**

It must contain, verbatim:
- The geometry: 2530×1380 physical, app region 2466×1327 at DSF 1.13, crop `(64, 53, 2530, 1380)`.
- A mapping table: baseline filename → spec §2.1/§2.5 row → source filename → what it shows.
- A mask table. Rectangles are written **`x0,y0 → x1,y1`** (exclusive `x1`/`y1`), in **full-capture physical coordinates**; the harness converts them to app-region offsets at load time:

| Baseline | Mask rect(s) | Why |
|---|---|---|
| `dashboard--dark.png` | `2100,0 → 2530,115`; `100,174 → 170,1297` | Chrome "Screenshot saved and copied" toast over the top-right header; row thumbnails |
| `dashboard--dark--banner.png` | `100,240 → 170,1297` | row thumbnails (the banner pushes the list down 55 px) |
| `dashboard--dark--import-menu.png` | `100,174 → 170,1297` | row thumbnails |
| `dashboard--dark--new-menu.png` | `100,174 → 170,1297` | row thumbnails |
| `dashboard--dark--new-folder-dialog.png` | `100,174 → 170,1297` | row thumbnails behind the scrim |
| `dashboard--light.png` | `100,174 → 170,1297` | row thumbnails |
| `dashboard--light--row-menu.png` | `100,174 → 170,1297` | row thumbnails |
| `dashboard--light--empty--banner.png` | `64,1290 → 360,1380` | the capture is **signed out**: its `Sign in` chip cannot match our account chip |

Three things about these rectangles are not arbitrary:

- **The toast really is only 62 px tall inside the app region.** The browser chrome ends at y=53; the toast panel is x 2107–2529, y 0–102 with a shadow to y≈111, so `y1=115` covers it with a little slack. Do not mask the whole top-right: the Import/New buttons and the segmented control are the point of this baseline.
- **Every baseline with project rows masks the thumbnail column.** The references show real Prism page previews; the fixtures have no thumbnail, so our rows render Prism's default thumbnail. The strip is deliberately generous (55 px box + 6 px each side, every row from the column-header bottom to the card bottom); Task 18 tightens it.
- **`dashboard--light--empty--banner` masks the bottom-left corner, not the empty state.** The signed-out chip and its menu-free area are the only unreproducible parts; the empty-state cluster in the middle of the card is fully gated, and so is the light banner.

- [ ] **Step 4: Commit**

```bash
git add e2e/baselines
git commit -m "test(visual): add Phase 1 dashboard reference baselines and mask map"
```

---

### Task 3: Visual diff harness

A separate Playwright project so the behavioural suite stays fast. It builds once, starts two servers (banner off on 3000, banner on on 3100), seeds deterministic fixtures, and diffs screenshots.

**Files:**
- Create: `playwright.visual.config.ts`
- Create: `e2e/visual/compare.ts`
- Create: `e2e/visual/helpers.ts`
- Create: `e2e/visual/fixtures.ts`
- Edit: `playwright.config.ts` (ignore `e2e/visual/**`)
- Edit: `package.json` (root: `test:visual` script)
- Edit: root `package.json` devDependencies: `pixelmatch@8.0.0`, `pngjs@7.0.0`, `@types/pngjs@^7.0.0`

**Interfaces:**
- Consumes: Task 2 (baselines)
- Produces: `pnpm test:visual` runs the visual suite; `compareAgainstReference(page, name)` returns the diff ratio and writes artifacts

- [ ] **Step 1: Add the dependencies**

```bash
pnpm add -D -w pixelmatch@8.0.0 pngjs@7.0.0 @types/pngjs@^7.0.0
```

- [ ] **Step 2: Write `e2e/visual/compare.ts`**

```ts
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
};

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
  const screenshot = await page.locator('[data-testid="app-root"]').screenshot();
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
```

- [ ] **Step 3: Write `playwright.visual.config.ts`**
```ts
import { defineConfig } from "@playwright/test";

const BASE_ENV = {
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgres://spektrum:spektrum@localhost:5432/spektrum_test",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ?? "e2e-secret-32-chars-minimum!!!!!",
  BETTER_AUTH_URL: "http://localhost:3000",
  LLM_KEY_ENCRYPTION_SECRET:
    process.env.LLM_KEY_ENCRYPTION_SECRET ?? "e2e-key-encryption-secret-32ch!x",
};

export default defineConfig({
  testDir: "./e2e/visual",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    // The references are 2530x1380 physical with 64 px of Chrome on the left
    // and 53 px on top, i.e. a 2466x1327 app region. Their scale is 1.13, not
    // 1.1: the 300 px search pill measures 339 physical, the 576 px dialog
    // (max-w-xl) 651, the 36 px header buttons 41, and the 51 px row pitch
    // (50 + divider) 57.6. 2182 x 1.13 = 2465.7 -> 2466; 1174 x 1.13 = 1326.6
    // -> 1327. compare.ts crops 1:1, never rescales.
    viewport: { width: 2182, height: 1174 },
    deviceScaleFactor: 1.13,
    // Freeze CSS animations (Radix menu/dialog zoom+fade) and hide the caret
    // so screenshots are deterministic and identical to the captures.
    animations: "disabled",
    caret: "hide",
    trace: "off",
  },
  projects: [
    {
      name: "visual",
      // Everything except the banner spec: these run against port 3000
      // (SHUTDOWN_BANNER=false). baseURL/viewport come from the shared `use`.
      testIgnore: /banner\.spec\.ts/,
    },
    {
      name: "visual-banner",
      // Both banner baselines live in banner.spec.ts and run against port 3100
      // (SHUTDOWN_BANNER=true).
      testMatch: /banner\.spec\.ts/,
      // Only the origin differs; viewport/DSF inherit from the shared `use`.
      use: { baseURL: "http://localhost:3100" },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @spektrum/web start -- -p 3000",
      url: "http://localhost:3000/login",
      // Never reuse: a `pnpm dev` server on 3000 renders a different page
      // (dev overlay, unminified CSS) and would silently corrupt the diff.
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...BASE_ENV,
        BETTER_AUTH_URL: "http://localhost:3000",
        SHUTDOWN_BANNER: "false",
      },
    },
    {
      command: "pnpm --filter @spektrum/web start -- -p 3100",
      url: "http://localhost:3100/login",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...BASE_ENV,
        BETTER_AUTH_URL: "http://localhost:3100",
        SHUTDOWN_BANNER: "true",
      },
    },
  ],
});
```

`pnpm build` must have run before `pnpm test:visual` (the script in Step 5 documents this). If the servers fail to boot with a 404 on `/login`, run `pnpm build` first.

- [ ] **Step 4: Write `e2e/visual/helpers.ts`**

```ts
import { expect, type Page } from "@playwright/test";

export const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? "owner@spektrum.local";
export const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD ?? "owner-password-123";
export const THEME_KEY = "crixet_light_mode_preference_v1";

export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Your Projects" })).toBeVisible();
  await movePointerAway(page);
}

/**
 * Park the pointer on the page background (inside the p-2 gutter, left of the
 * card). Every reference captures the dashboard with **no** hovered row and no
 * highlighted menu item, so the pointer must be moved away before screenshotting:
 * the click that opened a menu leaves the pointer inside its first item, and the
 * click that submitted the login form leaves it over the middle of the card.
 */
export async function movePointerAway(page: Page): Promise<void> {
  await page.mouse.move(4, 600);
}

export async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [THEME_KEY, theme],
  );
}
```

- [ ] **Step 5: Write `e2e/visual/fixtures.ts`**

```ts
import { execFileSync } from "node:child_process";

export type Dataset = "light" | "dark" | "empty";

/**
 * Re-seed the visual fixture. The seed is idempotent: it renames the owner,
 * deletes every project/folder, and inserts the deterministic dataset with
 * createdAt offsets from "now" so the relative-time strings are stable.
 */
export function seedVisualFixture(dataset: Dataset): void {
  execFileSync(
    "pnpm",
    ["--filter", "@spektrum/web", "visual:seed", dataset],
    { stdio: "inherit", env: process.env },
  );
}
```

- [ ] **Step 6: Write a placeholder spec and verify the harness boots**

Create `e2e/visual/dashboard.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { compareAgainstReference, VISUAL_BUDGET } from "./compare";
import { seedVisualFixture } from "./fixtures";
import { login, setTheme } from "./helpers";

test("dashboard dark matches the reference", async ({ page }) => {
  seedVisualFixture("dark");
  await setTheme(page, "dark");
  await login(page);
  const result = await compareAgainstReference(page, "dashboard--dark");
  expect(result.ratio).toBeLessThanOrEqual(VISUAL_BUDGET);
});
```

Update `playwright.config.ts` (testDir is already `./e2e`) to add `testIgnore: "**/visual/**"` so the main behavioural suite never picks up the visual specs.

Add to root `package.json` scripts (only this one — the seed script lives in `apps/web`, Task 7):

```json
"test:visual": "playwright test --config=playwright.visual.config.ts"
```

Run `pnpm test:visual`. Expected at this point: the servers boot, the seed fails (Task 7 hasn't written it), and the test fails. That is fine — the point is to prove the config, ports, and crop geometry are wired.

- [ ] **Step 7: Commit**

```bash
git add playwright.visual.config.ts e2e/visual package.json playwright.config.ts
git commit -m "test(visual): add dashboard pixel-diff harness and two-server config"
```

---

### Task 4: Dashboard tokens and Tailwind wiring

The dashboard needs one token the Phase 0 set does not define (`--dashboard-card-bg`), a set of `--color-*` mappings for the utilities the new primitives use, and Tailwind must scan `packages/ui` so those utilities are generated.

Banner colours are **derived, not tokens**: the bundle writes `bg-fg-warning/10` and `border-notification-border-warning/25`, which composite to exactly the measured values. With `--fg-warning`/`--notification-border-warning` = `--orange-500` = `#ffb200`:

| Surface | Light | Dark |
|---|---|---|
| banner bg | `#ffb200` @ 10 % over `#f1f1f1` = `(242,234,216)` | over `#161616` = `(46,38,20)` |
| banner border | 25 % over that = `(246,220,162)` | = `(98,72,15)` |
| warning icon | `--tools-text-warning` = `--orange-800` = `#855600` (measured `(133,86,0)`) | `--orange-100` = `#ffe6b7` (measured `(255,230,183)`) |

All three measured pairs match the CSS math exactly, so no `--banner-*` tokens exist.

**Files:**
- Edit: `packages/ui/styles/tokens.css`
- Edit: `packages/ui/src/tokens.test.ts`
- Edit: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: nothing
- Produces: `--dashboard-card-bg` declared in both theme blocks and pinned by `tokens.test.ts`; every `--color-*` utility name the plan uses resolves

- [ ] **Step 1: Add the token**

In `packages/ui/styles/tokens.css`, inside the **light** block (`html:not(.dark), html.dark .force-light`), add:

```css
--dashboard-card-bg: var(--neutral-50);
```

Inside the **dark** block (`html.dark, html:not(.dark) .force-dark`), add:

```css
--dashboard-card-bg: #27282980;
```

`#27282980` is 50 % opaque — over the dark page (`#161616`) it composites to `#1f1f20`, which is what the capture shows.

Also add the two shadcn vars the extraction missed (they exist in the live
stylesheet — `zenno/recon/css/*.css` — but not in `tokens-{root,light,dark}.css`;
`:root` already carries `--background: 0 0% 100%` and `--input: 0 0% 89.8%`):

```css
/* in the dark block */
--background: 0 0% 3.9%;
--input: 0 0% 14.9%;
```

These are HSL triples consumed as `hsl(var(--...))`, exactly as the reference
does: the dialog input measures `#0a0a0a` = `hsl(0 0% 3.9%)` and its border
`#262626` = `hsl(0 0% 14.9%)`. Add a comment above them noting they come from
the bundled CSS, not the three extraction files, so a future re-extraction does
not delete them.

- [ ] **Step 2: Map tokens in `globals.css`**

Add to the `@theme` block. These are all declared in `tokens.css` already but have **no** `--color-*` mapping today (verified against the current file), plus the one new token:

```css
--color-dashboard-card-bg: var(--dashboard-card-bg);
--color-background: hsl(var(--background));
--color-input: hsl(var(--input));
--color-optionmenu-fg-primary: var(--optionmenu-fg-primary);
--color-optionmenu-text-primary: var(--optionmenu-text-primary);
--color-optionmenu-text-primary-hover: var(--optionmenu-text-primary-hover);
--color-optionmenu-border: var(--optionmenu-border);
--color-button-primary-bg-hover: var(--button-primary-bg-hover);
--color-button-primary-text-hover: var(--button-primary-text-hover);
--color-button-secondary-text: var(--button-secondary-text);
--color-button-secondary-bg-hover: var(--button-secondary-bg-hover);
--color-button-tertiary-text: var(--button-tertiary-text);
--color-button-tertiary-text-hover: var(--button-tertiary-text-hover);
--color-button-tertiary-bg-hover: var(--button-tertiary-bg-hover);
--color-text-nav-primary: var(--text-nav-primary);
--color-text-nav-secondary: var(--text-nav-secondary);
--color-text-nav-tertiary: var(--text-nav-tertiary);
--color-project-list-divider: var(--project-list-divider);
--color-fg-warning: var(--fg-warning);
--color-tools-text-warning: var(--tools-text-warning);
```

(`--color-optionmenu-bg`, `--color-optionmenu-bg-hover`, `--color-input-bg`, `--color-fg-*` except `warning`, `--color-button-primary-bg/-text`, `--color-button-secondary-bg`, `--color-modal-bg`, `--color-border-outline`, `--color-border-modal`, `--color-bg-tertiary`, `--color-text-editor-*`, `--color-dropdown-*`, `--color-notification-border-warning` are already mapped — do not duplicate them.)

- [ ] **Step 3: Make Tailwind scan `packages/ui` and class-based dark mode**

At the top of `apps/web/src/app/globals.css`, after the two imports, add:

```css
@custom-variant dark (&:where(.dark, .dark *));
@source "../../../packages/ui/src";
```

The first line makes the `dark:` variant follow the `html.dark` class that `theme-script.tsx` sets (Tailwind v4 defaults to `prefers-color-scheme`; the codebase currently has no `dark:` classes, so nothing changes until this lands). The second line is required so every utility class used by the `packages/ui` primitives is generated — without it the primitives render unstyled.

- [ ] **Step 4: Pin the token**

In `packages/ui/src/tokens.test.ts`, add to `LIGHT`:

```ts
"--dashboard-card-bg": "var(--neutral-50)",
```

and to `DARK`:

```ts
"--dashboard-card-bg": "#27282980",
"--background": "0 0% 3.9%",
"--input": "0 0% 14.9%",
```

- [ ] **Step 5: Verify**

```bash
pnpm test -- --project ui
pnpm typecheck
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/styles/tokens.css packages/ui/src/tokens.test.ts apps/web/src/app/globals.css
git commit -m "feat(ui): add dashboard card token and missing colour mappings"
```

---

### Task 5: Icon registry additions

Fourteen new icons, hand-authored to the §5.8 geometry: 16×16 viewBox, `fill="none"`, `stroke="currentColor"`, `stroke-width="1.5"`, round caps and joins.

**Files:**
- Edit: `packages/ui/src/icons/index.tsx`
- Edit: `packages/ui/src/icons/icons.test.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `IconList`, `IconGrid`, `IconPlus`, `IconMoreHorizontal`, `IconSortAscending`, `IconSortDescending`, `IconChevronExpand`, `IconDownload`, `IconSettings`, `IconKeyboard`, `IconFeedback`, `IconMail`, `IconLogOut`, `IconUser` exported from `@spektrum/ui/icons`

- [ ] **Step 1: Add the icons**

Append to `packages/ui/src/icons/index.tsx`:

```tsx
export function IconList({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M6 4h8" />
      <path d="M6 8h8" />
      <path d="M6 12h8" />
      <path d="M2.5 4h.01" />
      <path d="M2.5 8h.01" />
      <path d="M2.5 12h.01" />
    </svg>
  );
}

export function IconGrid({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M4 4h.01" />
      <path d="M8 4h.01" />
      <path d="M12 4h.01" />
      <path d="M4 8h.01" />
      <path d="M8 8h.01" />
      <path d="M12 8h.01" />
      <path d="M4 12h.01" />
      <path d="M8 12h.01" />
      <path d="M12 12h.01" />
    </svg>
  );
}

export function IconPlus({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M8 3v10" />
      <path d="M3 8h10" />
    </svg>
  );
}

export function IconMoreHorizontal({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M4 8h.01" />
      <path d="M8 8h.01" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function IconSortAscending({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M5 6.5 8 3.5l3 3" />
    </svg>
  );
}

export function IconSortDescending({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M5 9.5 8 12.5l3-3" />
    </svg>
  );
}

export function IconChevronExpand({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M5 6.5 8 4l3 2.5" />
      <path d="M5 9.5 8 12l3-2.5" />
    </svg>
  );
}

export function IconDownload({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M8 3v7" />
      <path d="M5.5 7.5 8 10l2.5-2.5" />
      <path d="M4 13h8" />
    </svg>
  );
}

export function IconSettings({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 2.5v2" />
      <path d="M8 11.5v2" />
      <path d="M2.5 8h2" />
      <path d="M11.5 8h2" />
      <path d="m4 4 1.4 1.4" />
      <path d="m10.6 10.6 1.4 1.4" />
      <path d="m12 4-1.4 1.4" />
      <path d="m5.4 10.6-1.4 1.4" />
    </svg>
  );
}

export function IconKeyboard({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <rect x="2" y="4" width="12" height="8" rx="1.5" />
      <path d="M4.5 7h.01" />
      <path d="M7 7h.01" />
      <path d="M9.5 7h.01" />
      <path d="M12 7h.01" />
      <path d="M5.5 10h5" />
    </svg>
  );
}

export function IconFeedback({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M3 4h10v6.5H8L5.5 13V10.5H3z" />
      <path d="M5.5 6.5h5" />
      <path d="M5.5 8.5h3" />
    </svg>
  );
}

export function IconMail({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <rect x="2" y="4" width="12" height="8" rx="1.5" />
      <path d="m3 5 5 4 5-4" />
    </svg>
  );
}

export function IconLogOut({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M6.5 3H4v10h2.5" />
      <path d="M10.5 5.5 13 8l-2.5 2.5" />
      <path d="M13 8H6" />
    </svg>
  );
}

export function IconUser({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3.5 13.5c0-2.2 2-3.7 4.5-3.7s4.5 1.5 4.5 3.7" />
    </svg>
  );
}
```

- [ ] **Step 2: Extend the icon test**

In `packages/ui/src/icons/icons.test.tsx`, add every new name to `STROKED` (all fourteen are stroked):

```ts
const STROKED = [
  "IconSearch",
  "IconWarning",
  "IconError",
  "IconInfo",
  "IconCheck",
  "IconClose",
  "IconChevronDown",
  "IconChevronRight",
  "IconList",
  "IconGrid",
  "IconPlus",
  "IconMoreHorizontal",
  "IconSortAscending",
  "IconSortDescending",
  "IconChevronExpand",
  "IconDownload",
  "IconSettings",
  "IconKeyboard",
  "IconFeedback",
  "IconMail",
  "IconLogOut",
  "IconUser",
] as const;
```

- [ ] **Step 3: Verify**

```bash
pnpm test -- --project ui
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/icons
git commit -m "feat(ui): add dashboard and account-menu icons"
```

---

### Task 6: UI primitives

Radix-backed primitives with the exact variants the dashboard needs. No styling is invented here beyond the tokens.

**Files:**
- Edit: `packages/ui/package.json` (deps: `@radix-ui/react-dropdown-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-slot`, `clsx`, `tailwind-merge`)
- Create: `packages/ui/src/lib/cn.ts`
- Create: `packages/ui/src/primitives/button.tsx`
- Create: `packages/ui/src/primitives/input.tsx`
- Create: `packages/ui/src/primitives/dropdown-menu.tsx`
- Create: `packages/ui/src/primitives/dialog.tsx`
- Create: `packages/ui/src/primitives/primitives.test.tsx`
- Edit: `packages/ui/src/index.ts` (re-export the primitives)

**Interfaces:**
- Consumes: Task 4 (Tailwind scans this package)
- Produces: `Button`, `Input`, `DropdownMenu` (+ `DropdownMenuSeparator`), `Dialog`, `cn`

- [ ] **Step 1: Install the dependencies**

```bash
pnpm --filter @spektrum/ui add @radix-ui/react-dropdown-menu@2.2.1 @radix-ui/react-dialog@1.3.1 @radix-ui/react-slot@1.5.0 clsx@2.1.1 tailwind-merge@3.7.0
```

- [ ] **Step 2: Write `cn.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Write `button.tsx`**

Variants and sizes matching the capture:

```tsx
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

// No "destructive" variant in Phase 1: the row-menu Delete is NOT red (D24),
// so nothing uses it. Re-add when a genuinely destructive action exists.
export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-button-primary-bg text-button-primary-text hover:bg-button-primary-bg-hover hover:text-button-primary-text-hover",
  secondary:
    "bg-button-secondary-bg text-button-secondary-text hover:bg-button-secondary-bg-hover border border-[color:var(--border-outline)]",
  ghost:
    "bg-transparent text-button-tertiary-text hover:bg-button-tertiary-bg-hover hover:text-button-tertiary-text-hover",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  // The header's Import and New buttons measure 41 physical = 36 CSS tall
  // (h-9) and 113/123 physical = 100/109 CSS wide, i.e. natural width from
  // px-4 + gap-2 + a 16 px icon. No fixed widths.
  md: "h-9 px-4 text-sm gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-full font-normal",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-button-primary-bg",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
});
```

- [ ] **Step 4: Write `input.tsx`**

The bundle's input is the generic shadcn one (`hE`): `flex h-10 w-full rounded-md
border border-input bg-background px-3 py-2 text-sm ...`. `bg-background` matters:
in dark it resolves to `hsl(0 0% 3.9%)` = `#0a0a0a` (the dialog input measures
exactly `(10,10,10)`), which is darker than `--input-bg` (`#2a2a2a`). Task 4 adds
the missing dark `--background` / `--input` declarations and their `--color-*`
mappings.

```tsx
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-fg-primary",
          "placeholder:text-text-editor-placeholder",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-button-primary-bg",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...rest}
      />
    );
  },
);
```

- [ ] **Step 5: Write `dropdown-menu.tsx`**

Radix `DropdownMenu` with the capture's surface styling. The menu is a positioned element, so the styling must come from our wrapper, not from the trigger.

```tsx
import * as R from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export const DropdownMenu = R.Root;
export const DropdownMenuTrigger = R.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 9,
  align = "end",
  children,
  ...rest
}: R.DropdownMenuContentProps & { children: ReactNode }) {
  return (
    <R.Portal>
      {/* Bundle module 845912: the surface is `bg-optionmenu-bg p-1 rounded-2xl
          shadow-[var(--shadow-menu)]` (→ our `shadow-menu`) inside the Radix
          content (`z-[2100]`, no border — the capture's menu edge is shadow
          only, fill #353535 = --optionmenu-bg dark). */}
      <R.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-50 min-w-[200px] overflow-clip rounded-2xl bg-optionmenu-bg p-1 shadow-menu",
          "focus:outline-none",
          className,
        )}
        {...rest}
      >
        {children}
      </R.Content>
    </R.Portal>
  );
}

export function DropdownMenuItem({
  className,
  children,
  ...rest
}: R.DropdownMenuItemProps & { children: ReactNode }) {
  return (
    // Bundle `optionMenuItemClassName`: h-10, rounded-xl, text-sm font-medium
    // leading-5, text-optionmenu-text-primary, hover + data-highlighted bg.
    <R.Item
      className={cn(
        "flex h-10 w-full cursor-pointer select-none items-center gap-2 rounded-xl px-3 text-sm font-medium leading-5 text-optionmenu-text-primary outline-none",
        "hover:bg-optionmenu-bg-hover hover:text-optionmenu-text-primary-hover",
        "data-[highlighted]:bg-optionmenu-bg-hover data-[highlighted]:text-optionmenu-text-primary-hover",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </R.Item>
  );
}

// DropdownMenuSeparator is NOT exported from this step — Step 7 adds it.
```

- [ ] **Step 6: Write `dialog.tsx`**

The bundle's alert-dialog module (681562) is the authority; its content class is
`grid h-auto w-full max-w-xl gap-4 p-6 shadow-lg bg-modal-bg rounded-xl` (+ `border
border-border-outline` in light only), the overlay is `backdrop-blur-md` +
`bg-white/10 backdrop-brightness-110` in dark / `bg-black/20 backdrop-brightness-95`
in light, the title is `text-text-editor-primary text-lg font-semibold`, the
description `text-text-editor-secondary text-sm`, the header
`flex flex-col space-y-2 text-center sm:text-left`, the footer
`flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2`, and both buttons
are the generic Button at size `default` (`h-10 px-4 py-2`, `rounded-full`):
action = variant default/theme new (`bg-button-primary-bg text-button-primary-text`),
cancel = variant outline (`text-button-secondary-text`).

```tsx
import * as R from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export const Dialog = R.Root;
export const DialogTrigger = R.Trigger;

// Bundle: `text-text-editor-primary text-lg font-semibold` — weight 600, and the
// default `text-lg` line-height (28 px), not `leading-6`.
export function DialogTitle({
  className,
  ...rest
}: R.DialogTitleProps) {
  return (
    <R.Title
      className={cn("text-lg font-semibold text-text-editor-primary", className)}
      {...rest}
    />
  );
}

export function DialogDescription({
  className,
  ...rest
}: R.DialogDescriptionProps) {
  return (
    <R.Description
      className={cn("text-sm text-text-editor-secondary", className)}
      {...rest}
    />
  );
}

export function DialogContent({
  className,
  children,
  ...rest
}: R.DialogContentProps & { children: ReactNode }) {
  return (
    <R.Portal>
      {/* Ref 15 (dark): the scrim lightens the card from #1f1f20 to (56,56,57).
          That is white @10 % over the card after `backdrop-brightness-110`
          (31*1.1=34; 0.1*255+0.9*34=56) plus `backdrop-blur-md`. No light-theme
          dialog capture exists; the light pair is the bundle's own. */}
      <R.Overlay
        className={cn(
          "fixed inset-0 z-50 backdrop-blur-md",
          "bg-black/20 backdrop-brightness-95 dark:bg-white/10 dark:backdrop-brightness-110",
        )}
      />
      {/* Measured in ref 15: 651x246 physical = 576x218 CSS = `max-w-xl`, centred,
          radius 13.6 physical = 12 CSS = `rounded-xl`, bg #1f1f1f = --modal-bg,
          shadow ~19 physical below the panel. NO close X. */}
      <R.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid h-auto w-full max-w-xl -translate-x-1/2 -translate-y-1/2",
          "gap-4 rounded-xl bg-modal-bg p-6 shadow-lg",
          // The bundle adds the border in light mode only; a transparent border
          // in dark keeps the inner metrics identical to the capture.
          "border border-border-outline dark:border-transparent",
          "focus:outline-none",
          className,
        )}
        {...rest}
      >
        {children}
      </R.Content>
    </R.Portal>
  );
}

// `sm:` is always true at our viewport widths, so the sm: branch applies.
export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 text-left">{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-row justify-end gap-2">{children}</div>;
}

// Ref 15 footer, measured: the action pill is 133x47 physical = 118x41 CSS at
// `px-4`, and it is grey #8f8f8f because the empty input disables it — white
// (--button-primary-bg) @ 50 % over #1f1f1f. Using a solid grey token instead
// would be ~0.18 % of all pixels by itself, so use the real token + opacity.
export function DialogAction({
  className,
  ...rest
}: R.DialogCloseProps) {
  return (
    <R.Close
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-full bg-button-primary-bg px-4 text-sm font-medium text-button-primary-text",
        "hover:bg-button-primary-bg-hover hover:text-button-primary-text-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-button-primary-bg",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}

// Variant outline: text-button-secondary-text (#e8e8e8 dark), px-4 (the Cancel
// text ends 28 physical before the pill's left edge = 16 CSS padding + 8 CSS
// footer gap).
export function DialogCancel({
  className,
  ...rest
}: R.DialogCloseProps) {
  return (
    <R.Close
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium text-button-secondary-text",
        "hover:bg-button-secondary-bg-hover hover:text-button-secondary-text-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-button-primary-bg",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}
```

- [ ] **Step 7: Add `DropdownMenuSeparator`**

Append to `dropdown-menu.tsx` (it does not exist yet — Step 5 deliberately stopped before it):

```tsx
export function DropdownMenuSeparator({
  className,
  ...rest
}: R.DropdownMenuSeparatorProps) {
  return (
    <R.Separator
      className={cn("my-1 h-px bg-optionmenu-border", className)}
      {...rest}
    />
  );
}
```

- [ ] **Step 8: Write `primitives.test.tsx`**

Assertions:
- `Button` renders a `<button>` with the variant/size classes and forwards `aria-label`.
- `Input` forwards `aria-label` and `placeholder`.
- `DropdownMenuContent` renders in a portal with `role="menu"`; `DropdownMenuItem` has `role="menuitem"`.
- `DialogContent` renders `role="dialog"` with `aria-modal="true"`, a `DialogTitle` and a `DialogDescription`.
- Every primitive is server-renderable (`renderToStaticMarkup` does not throw).

Keep the test dependency-free: use `react-dom/server`'s `renderToStaticMarkup` for `Button`/`Input`; for the Radix wrappers assert that each export is a function/component and that `DropdownMenuSeparator` exists. Do not add `@testing-library/react` to `packages/ui` here — Task 16 adds it when the theme-switcher test actually needs a DOM.

- [ ] **Step 9: Re-export from the barrel**

In `packages/ui/src/index.ts`:

```ts
export * from "./primitives/button";
export * from "./primitives/input";
export * from "./primitives/dropdown-menu";
export * from "./primitives/dialog";
export * from "./lib/cn";
```

- [ ] **Step 10: Verify**

```bash
pnpm install
pnpm test -- --project ui
pnpm typecheck
```

Expected: green.

- [ ] **Step 11: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add Radix-backed button, input, menu, and dialog primitives"
```

---

### Task 7: Server data, server actions, and the visual seed

All data access goes through Drizzle queries in one module and mutates through `"use server"` actions in another. The seed is a CLI so both the e2e suite and the visual suite can build the same fixture.

**Files:**
- Create: `apps/web/src/lib/relative-time.ts`
- Create: `apps/web/src/lib/relative-time.test.ts`
- Create: `apps/web/src/lib/projects.ts`
- Create: `apps/web/src/lib/projects.test.ts`
- Create: `apps/web/src/lib/actions.ts`
- Create: `apps/web/src/lib/actions.test.ts`
- Create: `apps/web/src/cli/visual-seed.ts`
- Edit: `apps/web/package.json` (`visual:seed` script)

**Interfaces:**
- Consumes: `packages/db` schema, `apps/web/src/auth/session.ts`
- Produces: `relativeTime(from, now)`, `listProjects(ownerId)`, `createProject`, `renameProject`, `duplicateProject`, `softDeleteProject`, `createFolder`, `projectName`, and the server actions `createBlankProject`, `createExampleProject`, `createFolderAction`, `renameProjectAction`, `duplicateProjectAction`, `deleteProjectAction`, `setThemePreferenceAction`

- [ ] **Step 1: Write `relative-time.ts`**

The thresholds are the ones the captures imply (`2d`, `18d`, `28d`, `5mo`, `6mo`, `9mo`):

```ts
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30.44 * DAY;
const YEAR = 365.25 * DAY;

/** Prism's mini relative-time strings: now, Nm, Nh, Nd, Nmo, Nyr. */
export function relativeTime(from: Date, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
  if (seconds < MINUTE) return "now";
  const minutes = Math.floor(seconds / MINUTE);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(seconds / HOUR);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(seconds / DAY);
  if (days < 31) return `${days}d`;
  const months = Math.round(seconds / MONTH);
  if (months < 12) return `${months}mo`;
  return `${Math.round(seconds / YEAR)}yr`;
}
```

- [ ] **Step 2: Write `relative-time.test.ts`**

Pin the boundaries with a fixed `now` of `2026-11-09T12:00:00Z`:

| `from` offset | expected |
|---|---|
| 30 s | `now` |
| 59 s | `now` |
| 60 s | `1m` |
| 59 min | `59m` |
| 60 min | `1h` |
| 23 h | `23h` |
| 24 h | `1d` |
| 2 d | `2d` |
| 30 d | `30d` |
| 31 d | `1mo` |
| 183 d | `6mo` |
| 274 d | `9mo` |
| 365 d | `1yr` |
| 730 d | `2yr` |

Also assert the function is pure and never returns a negative value.

- [ ] **Step 3: Write `projects.ts`**

```ts
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@spektrum/db";
import { folders, projects } from "@spektrum/db/schema";

export interface ProjectRow {
  id: string;
  name: string;
  folderId: string | null;
  createdAt: Date;
}

export async function listProjects(ownerId: string): Promise<ProjectRow[]> {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      folderId: projects.folderId,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(and(eq(projects.ownerId, ownerId), isNull(projects.deletedAt)))
    .orderBy(desc(projects.createdAt));
}

export async function createProject(ownerId: string, name: string): Promise<ProjectRow> {
  const [row] = await db
    .insert(projects)
    .values({ ownerId, name })
    .returning({
      id: projects.id,
      name: projects.name,
      folderId: projects.folderId,
      createdAt: projects.createdAt,
    });
  return row!;
}

export async function renameProject(ownerId: string, id: string, name: string): Promise<void> {
  await db
    .update(projects)
    .set({ name })
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)));
}

export async function duplicateProject(
  ownerId: string,
  id: string,
  name: string,
): Promise<ProjectRow> {
  const [source] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
    .limit(1);
  if (!source) throw new Error("project not found");
  return createProject(source.ownerId, name);
}

export async function softDeleteProject(ownerId: string, id: string): Promise<void> {
  await db
    .update(projects)
    .set({ deletedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)));
}

export async function createFolder(ownerId: string, name: string): Promise<string> {
  const [row] = await db.insert(folders).values({ ownerId, name }).returning({ id: folders.id });
  return row!.id;
}

export async function projectName(ownerId: string, id: string): Promise<string> {
  const [row] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
    .limit(1);
  return row?.name ?? "New Project";
}
```

Every mutating query is scoped by `ownerId` as well as `id`: the server actions take the id straight from the client, so a bare `where(eq(projects.id, id))` would let any signed-in user rename or delete another user's project. `projectName` is scoped for the same reason (it feeds the duplicate name).

- [ ] **Step 4: Write `projects.test.ts`**

Use the existing `spektrum_unit` database. Each test:
- Creates a throwaway owner (or reuses the seeded one) and inserts projects with explicit `createdAt` values.
- Asserts `listProjects` excludes soft-deleted rows and orders by `createdAt` descending.
- Asserts `duplicateProject` copies `ownerId` and leaves the source untouched.
- Asserts `softDeleteProject` sets `deletedAt` and removes the row from `listProjects`.
- Asserts `renameProject` / `softDeleteProject` do nothing when the `ownerId` does not match the project (cross-tenant guard).
- Cleans up in `afterEach` by deleting the owner (cascades).

Follow the style of the existing `apps/web/src/app/api/user/llm-key/route.test.ts`.

- [ ] **Step 5: Write `actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireUser } from "@/auth/session";
import {
  createFolder,
  createProject,
  duplicateProject,
  projectName,
  renameProject,
  softDeleteProject,
} from "./projects";

export async function createBlankProject(): Promise<void> {
  const user = await requireUser();
  await createProject(user.id, "New Project");
  revalidatePath("/");
}

export async function createExampleProject(): Promise<void> {
  const user = await requireUser();
  await createProject(user.id, "New Project");
  revalidatePath("/");
}

export async function createFolderAction(name: string): Promise<void> {
  const user = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return;
  await createFolder(user.id, trimmed);
  revalidatePath("/");
}

export async function renameProjectAction(id: string, name: string): Promise<void> {
  const user = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return;
  await renameProject(user.id, id, trimmed);
  revalidatePath("/");
}

export async function duplicateProjectAction(id: string): Promise<void> {
  const user = await requireUser();
  const name = `Copy of ${await projectName(user.id, id)}`;
  await duplicateProject(user.id, id, name);
  revalidatePath("/");
}

export async function deleteProjectAction(id: string): Promise<void> {
  const user = await requireUser();
  await softDeleteProject(user.id, id);
  revalidatePath("/");
}

// Sign-out is NOT a server action: better-auth has no `nextCookies()` plugin
// here, so `auth.api.signOut` cannot clear the browser cookie. The account
// menu calls `authClient.signOut()` and then navigates to /login (Task 15).
export async function setThemePreferenceAction(pref: string): Promise<void> {
  (await cookies()).set("crixet_light_mode_preference_v1", pref, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
```

Add a private `projectName(id)` helper. Import `headers` from `next/headers`.

- [ ] **Step 6: Write `actions.test.ts`**

With the DB and a signed-in session available (follow the existing route-test pattern — either insert a session row directly or call the action with a mocked `requireUser`). Assert:
- Each action throws when unauthenticated.
- `createBlankProject` / `createExampleProject` insert a project named `New Project`.
- `renameProjectAction` trims and updates.
- `renameProjectAction` / `deleteProjectAction` are no-ops for a project owned by someone else (the `ownerId` scope).
- `deleteProjectAction` soft-deletes.
- `setThemePreferenceAction` sets the cookie (assert via `cookies().get(...)`).

- [ ] **Step 7: Write `visual-seed.ts`**

```ts
// Visual fixture seed — deterministic project list for the pixel-diff suite.
// Run: pnpm --filter @spektrum/web visual:seed light|dark|empty
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const envLocal = resolve(import.meta.dirname, "../../.env.local");
if (existsSync(envLocal)) process.loadEnvFile(envLocal);

import { eq } from "drizzle-orm";
import { db, pool } from "@spektrum/db";
import { folders, projects, users } from "@spektrum/db/schema";
import { createOwner } from "./create-owner";

const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? "owner@spektrum.local";
const OWNER_NAME = "Keylhan Paumard";

const LIGHT: Array<[string, number]> = [
  ["New Project", 2],
  ["New Project", 2],
  ["New Project", 18],
  ["New Project", 28],
  ["Challenge Me 3", 183],
  ["Nouveau projet", 183],
  ["Copie de PRJ - LINEAR ALGEBRA - V2", 183],
  ["Challenge Me 2", 183],
  ["Lab 1 - Fibonacci Sequence", 183],
  ["Challenge Me 1", 183],
  ["PRJ - LINEAR ALGEBRA - V2", 183],
  ["PRJ - LINEAR ALGEBRA - V1", 183],
  ["Nouveau projet", 183],
  ["Nouveau projet", 183],
  ["Nouveau projet", 183],
  ["Linear Algebra - PRJ", 183],
  ["Nouveau projet", 274],
];

const DARK: Array<[string, number]> = [
  ["New Project", 16],
  ["New Project", 26],
  ["Challenge Me 3", 152],
  ["Nouveau projet", 183],
  ["Copie de PRJ - LINEAR ALGEBRA - V2", 183],
  ["Challenge Me 2", 183],
  ["Lab 1 - Fibonacci Sequence", 183],
  ["Challenge Me 1", 183],
  ["PRJ - LINEAR ALGEBRA - V2", 183],
  ["PRJ - LINEAR ALGEBRA - V1", 183],
  ["Nouveau projet", 183],
  ["Nouveau projet", 183],
  ["Nouveau projet", 183],
  ["Linear Algebra - PRJ", 183],
  ["Nouveau projet", 274],
];

const EMPTY: Array<[string, number]> = [];

const arg = process.argv[2];
const dataset = arg === "light" ? LIGHT : arg === "empty" ? EMPTY : DARK;

// Mirror ci-seed.ts: create the owner if it does not exist yet (CI runs this
// seed without a prior ci-seed step).
let [owner] = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.email, OWNER_EMAIL))
  .limit(1);
if (!owner) {
  // `createOwner` refuses if ANY owner already exists (not just this email),
  // so a dev database bootstrapped with a personal address must be pointed at
  // via E2E_OWNER_EMAIL rather than silently seeding a second owner.
  try {
    const { id } = await createOwner({
      email: OWNER_EMAIL,
      password: process.env.E2E_OWNER_PASSWORD ?? "owner-password-123",
      name: OWNER_NAME,
    });
    owner = { id };
    console.log(`created owner ${OWNER_EMAIL}`);
  } catch (e) {
    console.error(
      `${(e as Error).message}\n` +
        `visual-seed needs the owner ${OWNER_EMAIL}. Set E2E_OWNER_EMAIL to the existing owner's address.`,
    );
    await pool.end();
    process.exit(1);
  }
}

await db.update(users).set({ name: OWNER_NAME }).where(eq(users.id, owner.id));
await db.delete(projects).where(eq(projects.ownerId, owner.id));
await db.delete(folders).where(eq(folders.ownerId, owner.id));

const now = Date.now();
for (let i = 0; i < dataset.length; i++) {
  const [name, days] = dataset[i]!;
  await db.insert(projects).values({
    ownerId: owner.id,
    name,
    // Each later row is one hour older so the `createdAt desc` order is total
    // even when many rows share the same day offset.
    createdAt: new Date(now - days * 86_400_000 - i * 3_600_000),
  });
}

console.log(`seeded ${dataset.length} projects for ${OWNER_EMAIL}`);
await pool.end();
```

- [ ] **Step 8: Add the script and verify**

In `apps/web/package.json`:

```json
"visual:seed": "tsx src/cli/visual-seed.ts"
```

```bash
pnpm --filter @spektrum/web visual:seed dark
pnpm test -- --project web
```

Expected: the seed prints `seeded 15 projects…`; the web unit suite is green.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib apps/web/src/cli/visual-seed.ts apps/web/package.json
git commit -m "feat(web): project queries, server actions, relative time, visual seed"
```

---

### Task 8: Dashboard shell

The authenticated route renders the page wrapper, the card, and the account chip. Everything inside the card is a placeholder until Tasks 9–13 fill it in.

**Files:**
- Rewrite: `apps/web/src/app/(app)/page.tsx`
- Create: `apps/web/src/app/(app)/dashboard/dashboard-client.tsx`
- Create: `apps/web/src/app/(app)/dashboard/dashboard-shell.test.tsx`
- Edit: `e2e/auth.spec.ts` (assert the shell, not just the heading)

**Interfaces:**
- Consumes: Tasks 3, 5, 6, 7
- Produces: `data-testid="app-root"` on the dashboard root; a card with `data-testid="dashboard-card"`; an account chip with `data-testid="account-chip"`

- [ ] **Step 1: No layout change**

`apps/web/src/app/(app)/layout.tsx` does not exist and none is needed — there is no rail (spec §6.1 as amended), so the route group adds nothing over the root layout. Do not create it.

- [ ] **Step 2: Write the page**

Rewrite `apps/web/src/app/(app)/page.tsx`. Keep the existing stub's auth handling **verbatim** — the `UnauthorizedError` redirect *and* the `ForbiddenError` "Access restricted" page (spec §19.1; `ForbiddenError` exposes `retryAfterMs`, not `reason`) — and only change the success return. Note `requireUser()` returns `{ id, email, role }` with **no `name`**, so the display name is read from the `users` table here:

```tsx
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@spektrum/db";
import { users } from "@spektrum/db/schema";
import { DashboardClient } from "./dashboard/dashboard-client";
import { listProjects } from "@/lib/projects";
import { requireUser, UnauthorizedError, ForbiddenError } from "@/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    // spec §19.1: UnauthorizedError -> redirect to /login, ForbiddenError ->
    // a banned/suspended cookie never reaches the app
    if (e instanceof UnauthorizedError) {
      redirect(`/login?from=${encodeURIComponent("/")}`);
    }
    if (e instanceof ForbiddenError) {
      const suspended = e.retryAfterMs !== undefined;
      return (
        <main style={{ padding: 32 }}>
          <h1>Access restricted</h1>
          <p>
            {suspended
              ? "Your account is suspended."
              : "Your account has been banned. Contact support if you believe this is an error."}
          </p>
        </main>
      );
    }
    throw e;
  }

  const [profile] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const projects = await listProjects(user.id);
  return (
    <DashboardClient
      userName={profile?.name ?? user.email}
      userEmail={user.email}
      projects={projects}
      bannerEnabled={process.env.SHUTDOWN_BANNER === "true"}
    />
  );
}
```

The banner flag is a **server-side** env var read here and passed down as a prop — `NEXT_PUBLIC_*` would be inlined at build time and could not differ between the two visual servers.

- [ ] **Step 3: Write `dashboard-client.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { ProjectRow } from "@/lib/projects";
import { ShutdownBanner } from "./shutdown-banner";
import { DashboardHeader } from "./header";
import { ProjectList } from "./project-list";
import { AccountChip } from "./account-chip";

export function DashboardClient({
  userName,
  userEmail,
  projects,
  bannerEnabled,
}: {
  userName: string;
  userEmail: string;
  projects: ProjectRow[];
  bannerEnabled: boolean;
}) {
  const [bannerVisible, setBannerVisible] = useState(true);

  return (
    <div
      data-testid="app-root"
      className="flex h-screen flex-col bg-bg-app p-2 text-fg-primary"
    >
      {/* Bundle `_k`: the banner sits in a `px-2 pt-2` (plus `pb-2`) wrapper,
          so its box is inset 8 CSS on the top/sides and the card follows after
          8 + 2 (`mt-0.5`) CSS — measured: banner y 62–117, card top y 130. */}
      {bannerEnabled && bannerVisible && (
        <div className="shrink-0 px-2 pb-2 pt-2">
          <ShutdownBanner onClose={() => setBannerVisible(false)} />
        </div>
      )}
      <main
        data-testid="dashboard-card"
        className="ml-2 mt-0.5 min-h-0 flex-1 rounded-xl bg-dashboard-card-bg"
      >
        <DashboardHeader />
        <ProjectList projects={projects} />
      </main>
      <AccountChip userName={userName} userEmail={userEmail} />
    </div>
  );
}
```

`h-screen` + `flex-1 min-h-0` on the card is what makes the card fill the viewport down to the account chip, exactly as the captures show. Without it the card shrinks to its content and the whole lower half of the reference diffs. The card has **no border** — the captures show a pure white card on `#f1f1f1` (light) and `#27282980` over `#161616` = `#1f1f20` (dark), with the rounded corners doing all the separation work.

- [ ] **Step 4: Write placeholder `header.tsx`, `project-list.tsx`, `account-chip.tsx`, `shutdown-banner.tsx`**

Each exports the named component with the right `data-testid` and a minimal render, so the shell compiles and the first visual diff has something to compare:

- `DashboardHeader`: `<header data-testid="dashboard-header" className="flex items-center gap-3 border-b border-[color:var(--project-list-divider)] px-5 py-3">` with the title `<h1 className="text-lg font-semibold">Your Projects</h1>`. (Task 9 replaces this with the full header: `py-3` + the 38 px controls + the 1 px divider = 62 CSS = the reference's 70 physical. Do **not** use `h-16` — that renders 64 px and shifts the whole list down.)
- `ProjectList`: `<div data-testid="project-list" className="flex min-h-0 flex-1 flex-col" />`.
- `AccountChip`: `<button data-testid="account-chip" className="ml-2 mt-3 flex items-center gap-1.5 rounded-lg px-5 py-2">` with a 24 px avatar circle containing the initial.
- `ShutdownBanner`: `<section data-testid="shutdown-banner" className="relative flex items-start gap-2 rounded-lg border border-notification-border-warning/25 bg-fg-warning/10 px-3 py-2 pr-11" />` inside the `px-2 pb-2 pt-2` wrapper (the full component lands in Task 14; this placeholder keeps the shell rendering at the right height: 50 px).

- [ ] **Step 5: Write `dashboard-shell.test.tsx`**

Render `DashboardClient` with `renderToStaticMarkup` and assert:
- `data-testid="app-root"` is present.
- The card and the chip are siblings, and the chip comes after the card.
- The title text is exactly `Your Projects`.
- No `<svg>` without `viewBox="0 0 16 16"`.

- [ ] **Step 6: Extend `e2e/auth.spec.ts`**

After the existing "owner signs in and lands on the dashboard shell" assertions, add:

```ts
await expect(page.getByTestId("app-root")).toBeVisible();
await expect(page.getByTestId("dashboard-card")).toBeVisible();
await expect(page.getByTestId("account-chip")).toBeVisible();
await expect(page.getByRole("heading", { name: "Your Projects" })).toBeVisible();
```

- [ ] **Step 7: Verify**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e
```

Expected: green. The dashboard renders a header, an empty list area, and the chip.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app e2e/auth.spec.ts
git commit -m "feat(dashboard): authenticated shell with card and account chip"
```

---

### Task 9: Header controls

Search, the list/grid toggle, and the Import and New menus.

**Files:**
- Rewrite: `apps/web/src/app/(app)/dashboard/header.tsx`
- Create: `apps/web/src/app/(app)/dashboard/import-menu.tsx`
- Create: `apps/web/src/app/(app)/dashboard/new-menu.tsx`
- Create: `apps/web/src/app/(app)/dashboard/layout-toggle.tsx`
- Create: `apps/web/src/app/(app)/dashboard/header.test.tsx`

**Interfaces:**
- Consumes: Tasks 5, 6, 7
- Produces: `DashboardHeader({ query, onQueryChange, layout, onLayoutChange })`; `ImportMenu`; `NewMenu`

- [ ] **Step 1: Write `layout-toggle.tsx`**

```tsx
"use client";

import { cn } from "@spektrum/ui";
import { IconGrid, IconList } from "@spektrum/ui/icons";

export type Layout = "list" | "grid";

export function LayoutToggle({
  layout,
  onChange,
}: {
  layout: Layout;
  onChange: (layout: Layout) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Layout"
      // Bundle: border neutral-300 in light only (`!isDark && "border ..."`);
      // dark has no border on the toggle.
      className="flex h-[38px] flex-row items-center gap-2 rounded-full border border-[color:var(--neutral-300)] bg-input-bg p-1 dark:border-transparent"
    >
      {(["list", "grid"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-label={value === "list" ? "List view" : "Grid view"}
          aria-pressed={layout === value}
          data-testid={value === "list" ? "layout-list" : "layout-grid"}
          onClick={() => onChange(value)}
          className={cn(
            // Bundle: `p-1.5` + an 18 px (text-lg, 1em) icon = a 30 px button.
            "flex h-[30px] w-[30px] items-center justify-center rounded-full p-1.5",
            layout === value
              ? "bg-optionmenu-bg-hover text-fg-primary"
              : "text-fg-tertiary hover:text-fg-secondary",
          )}
        >
          {value === "list" ? <IconList size={18} /> : <IconGrid size={18} />}
        </button>
      ))}
    </div>
  );
}
```

The toggle's natural width is 2×30 + gap-2 + p-1 = 76 CSS (+2 border in light)
= 78 CSS = 88 physical, exactly the measured 88. No fixed `w-[80px]`.

- [ ] **Step 2: Write `import-menu.tsx`**

```tsx
"use client";

import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@spektrum/ui";
import { IconChevronDown } from "@spektrum/ui/icons";

export function ImportMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" className="justify-between">
          Import
          <IconChevronDown size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent sideOffset={9} align="end" className="min-w-[200px]">
        <DropdownMenuItem onSelect={() => {/* Phase 5: import archive */}}>
          Import archive (.zip, .tar.gz)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => {/* Phase 5: import folder */}}>
          Import Folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: Write `new-menu.tsx`**

Same shape, trigger is the primary `New` button with `IconPlus`, items `Blank project`, `Example project`, a separator, then `New folder` (with `separatorBefore`). Note the bundle's offsets differ per menu: Import `dk` uses `sideOffset: 9`, New `dN` uses `sideOffset: 8` — keep them distinct.

```tsx
"use client";

import { useState } from "react";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@spektrum/ui";
import { IconChevronDown, IconPlus } from "@spektrum/ui/icons";
import { createBlankProject, createExampleProject } from "@/lib/actions";
import { NewFolderDialog } from "./new-folder-dialog";

export function NewMenu() {
  const [folderOpen, setFolderOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="justify-between">
            <IconPlus size={16} />
            New
            <IconChevronDown size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent sideOffset={8} align="end" className="min-w-[200px]">
          <DropdownMenuItem onSelect={() => void createBlankProject()}>
            Blank project
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void createExampleProject()}>
            Example project
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setFolderOpen(true)}>New folder</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewFolderDialog open={folderOpen} onOpenChange={setFolderOpen} />
    </>
  );
}
```

- [ ] **Step 4: Write `header.tsx`**

```tsx
"use client";

import { IconSearch } from "@spektrum/ui/icons";
import { Input } from "@spektrum/ui";
import { ImportMenu } from "./import-menu";
import { LayoutToggle, type Layout } from "./layout-toggle";
import { NewMenu } from "./new-menu";

export function DashboardHeader({
  query,
  onQueryChange,
  layout,
  onLayoutChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
}) {
  return (
    <header
      data-testid="dashboard-header"
      className="flex items-center gap-3 border-b border-[color:var(--project-list-divider)] px-5 py-3"
    >
      {/* Bundle: `font-semibold text-lg font-inter text-text-nav-primary` (default
          28 px line-height; the header's 70 physical = 62 CSS height comes from
          py-3 + the 38 px controls + the 1 px border, not from the title). */}
      <h1 className="text-lg font-semibold text-text-nav-primary">Your Projects</h1>
      <div className="flex-1" />
      {/* Bundle: icon is 22 px at start-3.5, input pl-12, rounded-full,
          bg-input-bg; border = neutral-300 in light, --search-input-border
          in dark (measured: light edge #aeaeae ≈ neutral-300, dark edge
          ≈ neutral-500). Placeholder colour is text-editor-tertiary and
          hides on focus. */}
      <div className="relative w-[300px]">
        <IconSearch
          size={22}
          className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-text-editor-tertiary"
        />
        <Input
          aria-label="Search"
          placeholder="Search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="h-[38px] rounded-full border-[color:var(--neutral-300)] bg-input-bg pl-12 placeholder:text-text-editor-tertiary focus:placeholder-transparent dark:border-[color:var(--search-input-border)]"
        />
      </div>
      <LayoutToggle layout={layout} onChange={onLayoutChange} />
      <ImportMenu />
      <NewMenu />
    </header>
  );
}
```

- [ ] **Step 5: Wire the header into `dashboard-client.tsx`**

Add three pieces of state to `DashboardClient` and pass them to both children:

```tsx
const [query, setQuery] = useState("");
const [layout, setLayout] = useState<Layout>("list");
const [sort, setSort] = useState<Sort>({ key: "created", direction: "desc" });
```

```tsx
<DashboardHeader
  query={query}
  onQueryChange={setQuery}
  layout={layout}
  onLayoutChange={setLayout}
/>
<ProjectList
  projects={projects}
  query={query}
  layout={layout}
  sort={sort}
  onSort={setSort}
/>
```

Task 10 owns the filtering/sorting logic inside `ProjectList`; the state lives here so the header and the list stay in sync. The default sort (`created` descending) is what the captures show.

- [ ] **Step 6: Write `header.test.tsx`**

Assertions:
- The title is `Your Projects`.
- The search input has `aria-label="Search"` and placeholder `Search`.
- The toggle has two buttons with `aria-label`s `List view` / `Grid view`, exactly one `aria-pressed="true"`.
- Clicking `Grid view` calls `onLayoutChange("grid")`.
- The `Import` and `New` triggers are buttons with those names.
- Opening `Import` renders `Import archive (.zip, .tar.gz)` and `Import Folder` as menuitems.
- Opening `New` renders `Blank project`, `Example project`, `New folder` as menuitems.

Add `@testing-library/react@16.3.3`, `@testing-library/user-event@14.6.8`, and `jsdom@31.0.0` to `apps/web` devDependencies (versions verified against the npm registry on 2026-11-09). Do **not** change the `web` vitest project's `environment` in `vitest.config.ts` — its DB-backed tests need node. Instead, start each component test file with the pragma `// @vitest-environment jsdom`. The `ui` project gets the same three devDependencies (in `packages/ui`) for the Task 16 theme-switcher test, also via the pragma.

- [ ] **Step 7: Verify**

```bash
pnpm test -- --project web
pnpm typecheck && pnpm lint
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/\(app\)/dashboard
git commit -m "feat(dashboard): header search, layout toggle, import and new menus"
```

---

### Task 10: Project list

Column headers, list rows, grid cards, relative dates, and the filtering/sorting that the header controls.

**Files:**
- Create: `apps/web/src/app/(app)/dashboard/column-header.tsx`
- Create: `apps/web/src/app/(app)/dashboard/project-row.tsx`
- Create: `apps/web/src/app/(app)/dashboard/project-grid.tsx`
- Rewrite: `apps/web/src/app/(app)/dashboard/project-list.tsx`
- Create: `apps/web/src/app/(app)/dashboard/project-list.test.tsx`

**Interfaces:**
- Consumes: Tasks 5, 7, 9
- Produces: `ProjectList({ projects, query, layout, sort, onSort })`; `ColumnHeader`; `ProjectRow`; `ProjectGrid`; `sortProjects(projects, sort)`

- [ ] **Step 1: Write `column-header.tsx`**

```tsx
"use client";

import { cn } from "@spektrum/ui";
import { IconChevronExpand, IconSortAscending, IconSortDescending } from "@spektrum/ui/icons";

export type SortKey = "name" | "created";
export type SortDirection = "asc" | "desc";
export interface Sort {
  key: SortKey;
  direction: SortDirection;
}

// Bundle `p8`: each header shows ONE 12 px indicator — inactive headers get
// IconChevronExpand in text-nav-tertiary; the active header gets
// IconSortAscending/IconSortDescending in text-nav-secondary (verified in
// ref 12: Name shows the stacked up-down glyph, Created shows a down chevron).
function Indicator({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <IconChevronExpand size={12} className="text-text-nav-tertiary" />;
  return direction === "asc" ? (
    <IconSortAscending size={12} className="text-text-nav-secondary" />
  ) : (
    <IconSortDescending size={12} className="text-text-nav-secondary" />
  );
}

export function ColumnHeader({
  sort,
  onSort,
}: {
  sort: Sort;
  onSort: (sort: Sort) => void;
}) {
  const toggle = (key: SortKey) => {
    if (sort.key !== key) return onSort({ key, direction: "desc" });
    onSort({ key, direction: sort.direction === "desc" ? "asc" : "desc" });
  };

  return (
    <div
      data-testid="project-list-header"
      // Bundle `p8`: `flex items-center gap-3 px-5 py-2 text-xs
      // text-text-nav-secondary` — no fixed height, no own border. Its 34 CSS
      // height (py-2 + 18 px content) + the 1 px divider owned by the first row
      // below = 35 CSS = the measured 40 physical between the header divider
      // (y=134) and the first row divider (y=174).
      className="flex items-center gap-3 px-5 py-2 text-xs text-text-nav-secondary"
    >
      <button
        type="button"
        onClick={() => toggle("name")}
        aria-label="Sort by Name"
        className={cn(
          "flex flex-1 items-center gap-1 text-left transition-colors",
          sort.key === "name" ? "text-text-nav-secondary" : "text-text-nav-tertiary hover:text-text-nav-secondary",
        )}
      >
        Name
        <Indicator active={sort.key === "name"} direction={sort.direction} />
      </button>
      <button
        type="button"
        onClick={() => toggle("created")}
        aria-label="Sort by Created"
        className={cn(
          "flex w-20 items-center justify-end gap-1 text-nowrap transition-colors",
          sort.key === "created" ? "text-text-nav-secondary" : "text-text-nav-tertiary hover:text-text-nav-secondary",
        )}
      >
        Created
        <Indicator active={sort.key === "created"} direction={sort.direction} />
      </button>
      {/* Bundle `p8` trailing spacer: exactly `w-[26px] h-[18px]`. It mirrors
          the ⋯ trigger's box, so `Created` lands where the reference puts it. */}
      <div className="h-[18px] w-[26px]" aria-hidden="true" />
    </div>
  );
}
```

- [ ] **Step 2: Write `project-row.tsx`

```tsx
"use client";

import { cn } from "@spektrum/ui";
import { IconMoreHorizontal } from "@spektrum/ui/icons";
import { relativeTime } from "@/lib/relative-time";
import type { ProjectRow as ProjectRowModel } from "@/lib/projects";
import { RowMenu } from "./row-menu";

export function ProjectRow({
  project,
  now,
  onRename,
}: {
  project: ProjectRowModel;
  now: Date;
  onRename: (project: ProjectRowModel) => void;
}) {
  return (
    // Bundle row (`ft`), list mode: `flex items-center gap-3 text-sm
    // font-normal px-5` inside the parent's `divide-y` container — no fixed
    // height and no own border. The height is natural: the menu cell is
    // `py-2` + `p-2` trigger + 18 px icon = 50 CSS, + the 1 px divider from
    // `divide-y` = the measured 51 CSS pitch (57.6 physical).
    <div
      data-testid={`project-card-${project.id}`}
      className="group flex items-center gap-3 px-5 text-sm font-normal"
    >
      <button
        type="button"
        className="flex h-full flex-1 items-center gap-3 text-left focus-visible:outline-none"
        onClick={() => onRename(project)}
      >
        {/* List thumbnail: 50×40, no border/background on the container
            (the bundle only styles the grid thumbnail). Masked in the
            visual suite anyway. */}
        <span className="h-10 w-[50px] flex-none overflow-hidden" />
        <span className="truncate text-sm text-text-nav-primary">
          {project.name}
        </span>
      </button>
      {/* Bundle: `py-2 w-20 text-right text-xs font-light text-nowrap`. */}
      <span className="w-20 py-2 text-right text-xs font-light text-text-nav-secondary">
        {relativeTime(project.createdAt, now)}
      </span>
      <RowMenu project={project} onRename={onRename} />
    </div>
  );
}
```

`IconMoreHorizontal` is rendered inside `RowMenu` (always visible, per the amended §6.2).

- [ ] **Step 3: Write `project-grid.tsx`**

```tsx
"use client";

import { relativeTime } from "@/lib/relative-time";
import type { ProjectRow as ProjectRowModel } from "@/lib/projects";
import { RowMenu } from "./row-menu";

export function ProjectGrid({
  projects,
  now,
  onRename,
}: {
  projects: ProjectRowModel[];
  now: Date;
  onRename: (project: ProjectRowModel) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,140px))] justify-start gap-x-4 gap-y-5 px-5 py-4">
      {projects.map((project) => (
        <div
          key={project.id}
          data-testid={`project-card-${project.id}`}
          className="relative flex h-[148px] w-full min-w-0 flex-col overflow-hidden rounded-lg hover:bg-[var(--project-list-hover-bg)]"
        >
          <button
            type="button"
            onClick={() => onRename(project)}
            className="flex h-full w-full flex-col items-center gap-1.5 rounded-lg px-2 pb-2 pt-4 text-center"
          >
            <span className="h-[68px] w-[88px] flex-none overflow-hidden rounded-[5px] border border-[color:var(--project-list-divider)] bg-white p-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.22)]" />
            <span className="w-full truncate text-[13px] font-medium leading-4 text-fg-primary">
              {project.name}
            </span>
            <span className="w-full truncate text-xs leading-4 text-fg-tertiary">
              {relativeTime(project.createdAt, now)}
            </span>
          </button>
          <RowMenu project={project} onRename={onRename} layout="grid" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write `project-list.tsx`**

Owns the derived list and the empty state:

```tsx
"use client";

import { useMemo, useState } from "react";
import type { ProjectRow as ProjectRowModel } from "@/lib/projects";
import { ColumnHeader, type Sort } from "./column-header";
import { ProjectGrid } from "./project-grid";
import { ProjectRow } from "./project-row";
import { EmptyState } from "./empty-state";
import { RenameDialog } from "./rename-dialog";
import type { Layout } from "./layout-toggle";

export function ProjectList({
  projects,
  query,
  layout,
  sort,
  onSort,
}: {
  projects: ProjectRowModel[];
  query: string;
  layout: Layout;
  sort: Sort;
  onSort: (sort: Sort) => void;
}) {
  const [renaming, setRenaming] = useState<ProjectRowModel | null>(null);
  const [now] = useState(() => new Date());

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? projects.filter((p) => p.name.toLowerCase().includes(needle))
      : projects;
    const sorted = [...filtered].sort((a, b) => {
      const delta =
        sort.key === "name"
          ? a.name.localeCompare(b.name)
          : a.createdAt.getTime() - b.createdAt.getTime();
      return sort.direction === "asc" ? delta : -delta;
    });
    return sorted;
  }, [projects, query, sort]);

  return (
    // Bundle: one scroll container (`overflow-auto`) whose inner list is
    // `flex flex-col divide-y divide-[var(--project-list-divider)]` — the
    // dividers (including the one under the column header) are owned by
    // `divide-y`, not by the rows. In grid mode the same container becomes a
    // grid without dividers and without the column header.
    <section className="relative flex min-h-0 flex-1 flex-col overflow-auto" data-testid="project-list">
      {layout === "list" ? (
        <div className="flex flex-col divide-y divide-[var(--project-list-divider)]">
          <ColumnHeader sort={sort} onSort={onSort} />
          {visible.length === 0 ? (
            projects.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="flex-1 px-6 py-4 text-sm text-fg-tertiary">
                No projects match your search.
              </div>
            )
          ) : (
            visible.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                now={now}
                onRename={setRenaming}
              />
            ))
          )}
        </div>
      ) : (
        <ProjectGrid projects={visible} now={now} onRename={setRenaming} />
      )}
      <RenameDialog project={renaming} onOpenChange={() => setRenaming(null)} />
    </section>
  );
}
```

"No projects match your search." is not in the spec. It is a new string, so it needs a decision-log entry. Add to §17:

```markdown
| D25 | Added `No projects match your search.` for the filtered-empty case | The spec does not cover a non-empty project list with a query that matches nothing; the string follows the spec's sentence-case, no-trailing-punctuation rule (§16) |
```

- [ ] **Step 5: Write `project-list.test.tsx`**

Assertions:
- Renders one `project-card-*` per project.
- Typing in the search box filters by case-insensitive substring.
- Clicking `Sort by Name` re-orders; clicking again flips the direction.
- Clicking `Sort by Created` sorts by date.
- The default sort is `created` descending.
- With zero projects the column header stays visible and the empty state replaces the rows (verified in ref 43; the test asserts both).
- The relative date strings match the seeded offsets (`2d`, `18d`, `6mo`, `9mo`).
- The `⋯` button is present on every row without hover.

- [ ] **Step 6: Verify**

```bash
pnpm test -- --project web
pnpm typecheck && pnpm lint
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/\(app\)/dashboard
git commit -m "feat(dashboard): project list, grid, column headers, relative dates"
```

---

### Task 11: Row menu, rename, duplicate, delete

The `⋯` menu and the rename dialog. Delete is immediate.

**Files:**
- Create: `apps/web/src/app/(app)/dashboard/row-menu.tsx`
- Create: `apps/web/src/app/(app)/dashboard/rename-dialog.tsx`
- Create: `apps/web/src/app/(app)/dashboard/row-menu.test.tsx`

**Interfaces:**
- Consumes: Tasks 6, 7, 10
- Produces: `RowMenu({ project, onRename, layout })`; `RenameDialog({ project, onOpenChange })`

- [ ] **Step 1: Write `row-menu.tsx`**

```tsx
"use client";

import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@spektrum/ui";
import { IconMoreHorizontal } from "@spektrum/ui/icons";
import { deleteProjectAction, duplicateProjectAction } from "@/lib/actions";
import type { ProjectRow } from "@/lib/projects";

export function RowMenu({
  project,
  onRename,
  layout = "list",
}: {
  project: ProjectRow;
  onRename: (project: ProjectRow) => void;
  layout?: "list" | "grid";
}) {
  return (
    // Bundle: the menu cell wrapper is `text-fg-tertiary flex-none py-2` in list
    // mode (this py-2 is what makes the row 50 CSS tall) and `absolute right-0
    // top-0` in grid mode.
    <div className={cn("flex-none text-fg-tertiary", layout === "grid" ? "absolute right-0 top-0" : "py-2")}>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${project.name} actions`}
          className={cn(
            "flex items-center justify-center rounded-md p-2 text-fg-tertiary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-button-primary-bg",
            // Grid cards reveal the ⋯ on hover only (bundle behaviour); the
            // list keeps it always visible, which is what ref 46 shows.
            layout === "grid" && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          )}
        >
          <IconMoreHorizontal size={18} />
        </DropdownMenuTrigger>
        <DropdownMenuContent sideOffset={9} align="end" className="min-w-[200px]">
          <DropdownMenuItem onSelect={() => onRename(project)}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void duplicateProjectAction(project.id)}>
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void deleteProjectAction(project.id)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

The `layout` prop controls hover-reveal in grid mode only; in list mode the trigger is always visible (ref 46). The row menu has **no pointer arrow** and **no separators/icons** — Radix `DropdownMenuContent` renders an arrow only if `DropdownMenuArrow` is used, which we do not.

- [ ] **Step 2: Write `rename-dialog.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogAction, DialogCancel, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from "@spektrum/ui";
import { renameProjectAction } from "@/lib/actions";
import type { ProjectRow } from "@/lib/projects";

export function RenameDialog({
  project,
  onOpenChange,
}: {
  project: ProjectRow | null;
  onOpenChange: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (project) setName(project.name);
  }, [project]);

  const submit = async () => {
    if (!project || !name.trim() || pending) return;
    setPending(true);
    try {
      await renameProjectAction(project.id, name);
      onOpenChange();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={project !== null} onOpenChange={() => onOpenChange()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project name</DialogTitle>
          <DialogDescription>Enter a new name for your project.</DialogDescription>
        </DialogHeader>
        {/* The base Input is exactly the dialog input: h-10 (45 physical) and
            bg-background = #0a0a0a in dark, measured in ref 15. No overrides. */}
        <Input
          aria-label="Edit project name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <DialogFooter>
          <DialogCancel disabled={pending}>Cancel</DialogCancel>
          <DialogAction
            disabled={pending || !name.trim()}
            onClick={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            Save
          </DialogAction>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Write `row-menu.test.tsx`**

Assertions:
- The trigger has `aria-label="<name> actions"` and is visible without hover.
- The menu items are exactly `Rename`, `Duplicate`, `Delete`, in that order.
- `Delete` is not styled with a destructive colour class (assert the class list contains no `destructive` / `text-red-*`).
- Clicking `Rename` calls `onRename` with the project.
- The rename dialog shows `Edit project name`, `Enter a new name for your project.`, `Cancel`, `Save`.
- Submitting an empty name keeps the dialog open and does not call the action.

- [ ] **Step 4: Verify**

```bash
pnpm test -- --project web
pnpm typecheck && pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/dashboard
git commit -m "feat(dashboard): row menu with rename, duplicate, immediate delete"
```

---

### Task 12: New folder dialog

The dialog the New menu's `New folder` item opens. Creating a folder is the only folder behaviour in Phase 1; grouping and display are deferred to Phase 5.

**Files:**
- Create: `apps/web/src/app/(app)/dashboard/new-folder-dialog.tsx`
- Create: `apps/web/src/app/(app)/dashboard/new-folder-dialog.test.tsx`

**Interfaces:**
- Consumes: Tasks 6, 7, 9
- Produces: `NewFolderDialog({ open, onOpenChange })`

- [ ] **Step 1: Write `new-folder-dialog.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogAction, DialogCancel, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from "@spektrum/ui";
import { createFolderAction } from "@/lib/actions";

export function NewFolderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const submit = async () => {
    if (!name.trim() || pending) return;
    setPending(true);
    try {
      await createFolderAction(name);
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription>Create a folder to organize your projects.</DialogDescription>
        </DialogHeader>
        {/* Base Input as-is: h-10, bg-background (#0a0a0a dark) — see Task 11. */}
        <Input
          aria-label="New folder"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <DialogFooter>
          <DialogCancel disabled={pending}>Cancel</DialogCancel>
          <DialogAction
            disabled={pending || !name.trim()}
            onClick={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            Create folder
          </DialogAction>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write `new-folder-dialog.test.tsx`**

Assertions:
- The dialog is closed when `open` is false.
- The title is `New folder`; the description is `Create a folder to organize your projects.`
- The actions are `Cancel` and `Create folder`.
- `Create folder` is disabled while the input is empty or whitespace-only.
- Submitting calls `createFolderAction` with the trimmed name and closes the dialog.
- The input is focused on open.

- [ ] **Step 3: Verify**

```bash
pnpm test -- --project web
pnpm typecheck && pnpm lint
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(app\)/dashboard
git commit -m "feat(dashboard): new folder dialog"
```

---

### Task 13: Empty state

The signed-in empty dashboard. Copy is verbatim; the layout is top-anchored inside the card body, exactly as the bundle renders it (see Step 1).

**Files:**
- Create: `apps/web/src/app/(app)/dashboard/empty-state.tsx`
- Create: `apps/web/src/app/(app)/dashboard/empty-state.test.tsx`

**Interfaces:**
- Consumes: Tasks 6, 7, 10
- Produces: `EmptyState`

- [ ] **Step 1: Write `empty-state.tsx`**

The bundle component (`hk`) is:

```jsx
<div className="row-span-5 col-span-2 h-full">
  <div className="flex flex-col w-full items-center justify-center h-full gap-2">
    <div className="w-px h-[100px]" />
    <div className="text-base text-text-nav-primary mb-2">You don't have any projects yet</div>
    <div className="text-text-nav-tertiary text-sm font-light">Start with a hosted project on crixet</div>
    <div className="flex flex-row gap-1 m-4">
      <button className="rounded-full bg-button-primary-bg text-button-primary-text hover:text-button-primary-text-hover py-2 px-4 text-sm font-light">
        Start from Scratch
      </button>
    </div>
    <div className="w-px h-[150px]" />
  </div>
</div>
```

This contradicts spec §6.3 (which said 14/18 `--fg-secondary` + 12/16 `--fg-tertiary`): the real sizes are **16/24 `--text-nav-primary`** and **14/20 light `--text-nav-tertiary`**. The `h-full` collapses in the list container, so the group is **not** vertically centred — measured in ref 43: the heading's glyphs start 115 CSS px below the column-header divider (369−239 physical), which is the 100 px spacer + the 8 px `gap-2` + the 16/24 line-box leading. Implement it literally:

```tsx
"use client";

import { Button } from "@spektrum/ui";
import { createBlankProject } from "@/lib/actions";

export function EmptyState() {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-2 text-center">
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
```

The `size="sm"` Button is `h-8`; the `h-9` override matches the measured 41 physical = 36 CSS pill. `font-light` is the bundle's own weight (the header's `New` button stays the default weight).

- [ ] **Step 2: Write `empty-state.test.tsx`**

Assertions:
- The heading copy is exactly `You don't have any projects yet`.
- The sub-copy is exactly `Start with a hosted project on Prism`.
- The button is exactly `Start from Scratch` (not `New project`).
- Clicking the button calls `createBlankProject`.

- [ ] **Step 3: Verify the `empty` dataset**

`visual-seed.ts` already accepts `empty` (Task 7, Step 7 defines `EMPTY = []`). Nothing to edit — just verify below.

- [ ] **Step 4: Verify**

```bash
pnpm test -- --project web
pnpm --filter @spektrum/web visual:seed empty
pnpm typecheck && pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/dashboard apps/web/src/cli/visual-seed.ts
git commit -m "feat(dashboard): signed-in empty state"
```

---

### Task 14: Shutdown banner

Off by default; on when the server env `SHUTDOWN_BANNER === "true"` (the page passes it to the client as the `bannerEnabled` prop — see Task 8). Dismissible.

**Files:**
- Rewrite: `apps/web/src/app/(app)/dashboard/shutdown-banner.tsx`
- Create: `apps/web/src/app/(app)/dashboard/shutdown-banner.test.tsx`
- Edit: `apps/web/src/app/(app)/dashboard/dashboard-client.tsx` (dismissal state)

**Interfaces:**
- Consumes: Tasks 4, 5, 6
- Produces: `ShutdownBanner({ onClose })`

- [ ] **Step 1: Write `shutdown-banner.tsx`**

This is the bundle's `_f` component, class for class. Every value below is verified against refs 1 (dark) and 43 (light): height 50 CSS (32 px buttons + `py-2` + 2 px borders), text baseline and button heights match, close glyph centre 23 CSS from the banner's right border (32 px button inside `right-2`).

```tsx
"use client";

import { Button } from "@spektrum/ui";
import { IconClose, IconDownload, IconWarning } from "@spektrum/ui/icons";

export function ShutdownBanner({ onClose }: { onClose: () => void }) {
  return (
    <section
      aria-labelledby="shutdown-banner-title"
      data-testid="shutdown-banner"
      className="relative flex items-start gap-2 rounded-lg border border-notification-border-warning/25 bg-fg-warning/10 px-3 py-2 pr-11 sm:items-center"
    >
      <IconWarning
        aria-hidden="true"
        size={18}
        className="mt-0.5 shrink-0 text-tools-text-warning sm:mt-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="min-w-0 text-sm leading-5">
          <h2 id="shutdown-banner-title" className="inline font-semibold text-text-editor-primary">
            Prism will shut down on January 1, 2027.
          </h2>{" "}
          <p className="inline text-text-editor-secondary">
            Export your Prism projects before the shutdown date to keep a copy of your files.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            className="h-auto min-h-8 py-1.5 leading-snug"
          >
            <IconDownload size={16} />
            Open export settings
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-auto min-h-8 border border-border-outline bg-modal-bg py-1.5 leading-snug"
          >
            Migration guide
          </Button>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-2 top-2 h-8 w-8 px-0 text-text-editor-secondary sm:top-1/2 sm:-translate-y-1/2"
      >
        <IconClose size={16} />
      </Button>
    </section>
  );
}
```

Layout notes:
- At our width the `lg:` branch applies, so the text and the two buttons sit on one row (`justify-between`) and the whole banner stays 50 px tall: `py-2` (16) + tallest child (the 32 px buttons) + 2 px borders.
- `pr-11` reserves the close button's footprint; the close button is absolutely positioned and vertically centred at `sm:` and up.
- The banner sits in the shell's `px-2 pb-2 pt-2` wrapper (8 CSS top/sides/bottom); the card's `mt-0.5` adds 2 more. Verified: without the banner the card top sits 10 CSS below the app top (8 + 2), with it 68 CSS (8 + 50 + 8 + 2) — physical y 64 vs y 130.
- The two banner buttons are placeholders in Phase 1: `Open export settings` and `Migration guide` have no destinations yet (Phase 5). They must render and be focusable.

- [ ] **Step 2: Write `shutdown-banner.test.tsx`**

Assertions:
- The banner renders the exact copy.
- Both buttons are present with the exact labels.
- Clicking the close button calls `onClose`.
- No emoji and every `<svg>` has `viewBox="0 0 16 16"`.

- [ ] **Step 3: Wire dismissal into `dashboard-client.tsx`**

The component already receives `bannerEnabled` from the server page (Task 8). Change the render to:

```tsx
const [bannerVisible, setBannerVisible] = useState(true);
...
{bannerEnabled && bannerVisible && (
  <ShutdownBanner onClose={() => setBannerVisible(false)} />
)}
```

- [ ] **Step 4: Verify**

```bash
pnpm test -- --project web
pnpm typecheck && pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/dashboard
git commit -m "feat(dashboard): dismissible shutdown banner behind a flag"
```

---

### Task 15: Account chip and account menu

The chip below the card opens the account menu upward. Sign out ends the session.

**Files:**
- Rewrite: `apps/web/src/app/(app)/dashboard/account-chip.tsx`
- Create: `apps/web/src/app/(app)/dashboard/account-menu.tsx`
- Create: `apps/web/src/app/(app)/dashboard/account-chip.test.tsx`

**Interfaces:**
- Consumes: Tasks 5, 6, 7
- Produces: `AccountChip({ userName, userEmail })`; `AccountMenu`

- [ ] **Step 1: Write `account-menu.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@spektrum/ui";
import { IconFeedback, IconKeyboard, IconLogOut, IconMail, IconSettings } from "@spektrum/ui/icons";
import { authClient } from "@/auth/client";

export function AccountMenu({
  userEmail,
  trigger,
}: {
  userEmail: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();

  // Better Auth has no `nextCookies()` plugin in this app, so a server action
  // cannot clear the session cookie. The browser client hits
  // /api/auth/sign-out, which sets the cleared cookie on the response.
  const signOut = async () => {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      {/* Bundle `mG`: side="top", align="start", sideOffset 8, width = the
          trigger's available width capped at 300 px. */}
      <DropdownMenuContent side="top" sideOffset={8} align="start" className="max-w-[300px]">
        <DropdownMenuItem onSelect={() => {/* Phase 2: settings modal */}}>
          <IconSettings size={16} />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => {/* Phase 2: keyboard shortcuts */}}>
          <IconKeyboard size={16} />
          Keyboard shortcuts
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => {/* Phase 2: feedback */}}>
          <IconFeedback size={16} />
          Give feedback
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.open(`mailto:${userEmail}`, "_blank")}>
          <IconMail size={16} />
          {userEmail}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <IconLogOut size={16} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Write `account-chip.tsx`**

```tsx
"use client";

import { cn } from "@spektrum/ui";
import { IconChevronExpand, IconUser } from "@spektrum/ui/icons";
import { AccountMenu } from "./account-menu";

export function AccountChip({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  return (
    <AccountMenu
      userEmail={userEmail}
      trigger={
        <button
          type="button"
          data-testid="account-chip"
          className="ml-2 mt-3 flex items-center gap-1.5 rounded-lg px-5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-button-primary-bg"
        >
          {/* Bundle `mK` fallback avatar: 28 px, bg-button-secondary-bg,
              text-button-secondary-text, initial uppercase. */}
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-button-secondary-bg text-sm font-medium text-button-secondary-text">
            {userName.charAt(0).toUpperCase()}
          </span>
          <span className="flex flex-col">
            <span className="flex items-center gap-1 text-sm font-medium text-fg-primary">
              <span className="truncate">{userName}</span>
              <IconChevronExpand size={12} className="text-fg-tertiary" />
            </span>
            <span className="flex items-center gap-1 text-xs text-fg-tertiary">
              <IconUser size={12} />
              Personal workspace
            </span>
          </span>
        </button>
      }
    />
  );
}
```

- [ ] **Step 3: Write `account-chip.test.tsx`**

Assertions:
- The chip shows the owner's name and `Personal workspace`.
- The avatar shows the first initial.
- The menu items are exactly `Settings`, `Keyboard shortcuts`, `Give feedback`, the email, `Sign out`.
- `Sign out` is the last item and is preceded by a separator.
- No `Discord` item exists.

- [ ] **Step 4: Verify**

```bash
pnpm test -- --project web
pnpm typecheck && pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/dashboard
git commit -m "feat(dashboard): account chip and account menu with sign out"
```

---

### Task 16: Theme persistence and the ThemeSwitcher component

The switcher lives in the settings modal in Phase 2. Phase 1 delivers the component, its tests, and the persistence path so Phase 2 only has to mount it.

**Files:**
- Create: `packages/ui/src/theme-switcher.tsx`
- Create: `packages/ui/src/theme-switcher.test.tsx`
- Create: `apps/web/src/components/theme-preference.ts`
- Edit: `packages/ui/src/index.ts` (export `ThemeSwitcher`)

**Interfaces:**
- Consumes: Task 7 (`setThemePreferenceAction`), the existing `apps/web/src/components/theme-script.tsx`
- Produces: `ThemeSwitcher({ value, onChange })`, a `ThemePreference` re-export

Note: `themeInitScript` reads `localStorage[KEY] ?? cookie[KEY] ?? "dark"` **before paint**, and localStorage wins — so the persistence hook must write localStorage *and* the cookie (the server action), never the cookie alone. `apply()` must mirror the init script line for line or the first client-side toggle will visibly disagree with the boot state.

- [ ] **Step 1: Write `theme-switcher.tsx`**

```tsx
"use client";

import { cn } from "./lib/cn";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "crixet_light_mode_preference_v1";

export function ThemeSwitcher({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Interface theme"
      className="inline-flex items-center gap-1 rounded-full bg-input-bg p-1"
    >
      {(["light", "dark", "system"] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "h-8 rounded-full px-3 text-sm",
            value === option
              ? "bg-optionmenu-bg-hover text-fg-primary"
              : "text-fg-tertiary hover:text-fg-secondary",
          )}
        >
          {option === "light" ? "Light" : option === "dark" ? "Dark" : "System"}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 1b: Install the DOM test dependencies**

```bash
pnpm --filter @spektrum/ui add -D @testing-library/react@16.3.3 @testing-library/user-event@14.6.8 jsdom@31.0.0
```

- [ ] **Step 2: Write `theme-switcher.test.tsx`**

Start the file with `// @vitest-environment jsdom` — the shared `ui` vitest project runs in node for the token and icon tests.**

Assertions:
- All three options render with the exact labels `Light`, `Dark`, `System`.
- The selected option has `aria-checked="true"` and `role="radio"`.
- Clicking an option calls `onChange` with that value.
- The container has `role="radiogroup"` and `aria-label="Interface theme"`.

- [ ] **Step 3: Write the client persistence hook**

In `apps/web/src/components/theme-preference.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import { setThemePreferenceAction } from "@/lib/actions";
import type { ThemePreference } from "@spektrum/ui";

const KEY = "crixet_light_mode_preference_v1";

function apply(value: ThemePreference): void {
  const isDark =
    value === "dark" ||
    (value === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const html = document.documentElement;
  html.classList.toggle("dark", isDark);
  html.dataset.theme = isDark ? "dark" : "light";
  html.dataset.themePreference = value;
  html.style.colorScheme = isDark ? "dark" : "light";
}

export function useThemePreference(): {
  value: ThemePreference;
  set: (value: ThemePreference) => void;
} {
  const [value, setValue] = useState<ThemePreference>("dark");

  useEffect(() => {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      setValue(stored);
      apply(stored);
    }
  }, []);

  const set = (next: ThemePreference) => {
    setValue(next);
    localStorage.setItem(KEY, next);
    apply(next);
    void setThemePreferenceAction(next);
  };

  return { value, set };
}
```

- [ ] **Step 4: Verify**

```bash
pnpm test -- --project ui
pnpm test -- --project web
pnpm typecheck && pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src apps/web/src/components/theme-preference.ts
git commit -m "feat(ui): theme switcher component and client preference persistence"
```

---

### Task 17: Accessibility and icon-DOM assertions

The §15.2 rule — no emoji, every `<svg>` is 16×16 `currentColor` — becomes a test that runs on the dashboard.

**Files:**
- Create: `e2e/visual/accessibility.spec.ts`
- Edit: `apps/web/src/app/globals.css` (if any icon needs `fill="currentColor"`)

**Interfaces:**
- Consumes: Tasks 8–16
- Produces: a Playwright spec that walks the rendered DOM of the dashboard and fails on emoji or a malformed icon

- [ ] **Step 1: Write `e2e/visual/accessibility.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { login, seedVisualFixture, setTheme } from "./helpers";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{2BFF}]/u;

for (const theme of ["light", "dark"] as const) {
  test(`dashboard DOM has no emoji and only 16x16 currentColor icons (${theme})`, async ({ page }) => {
    seedVisualFixture(theme);
    await setTheme(page, theme);
    await login(page);

    const result = await page.evaluate((emoji) => {
      const re = new RegExp(emoji, "u");
      const text = document.body.innerText;
      const svgs = [...document.querySelectorAll("svg")].map((svg) => ({
        viewBox: svg.getAttribute("viewBox"),
        fills: [...svg.querySelectorAll("*")].map((n) => n.getAttribute("fill")),
        strokes: [...svg.querySelectorAll("*")].map((n) => n.getAttribute("stroke")),
      }));
      return { hasEmoji: re.test(text), svgs };
    }, EMOJI.source);

    expect(result.hasEmoji).toBe(false);
    expect(result.svgs.length).toBeGreaterThan(0);
    for (const svg of result.svgs) {
      expect(svg.viewBox).toBe("0 0 16 16");
      for (const fill of svg.fills) expect([null, "none", "currentColor"]).toContain(fill);
      for (const stroke of svg.strokes) {
        expect([null, "currentColor"]).toContain(stroke);
      }
    }

    // Icon-only controls are labelled.
    await expect(page.getByLabel("Search")).toBeVisible();
    for (const name of ["List view", "Grid view", "Import", "New"]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
    await expect(page.getByLabel("Sort by Name")).toBeVisible();
    await expect(page.getByLabel("Sort by Created")).toBeVisible();
  });
}
```

`helpers.ts` must re-export the fixture helper so both specs share one import surface:

```ts
export { seedVisualFixture } from "./fixtures";
```

Move `login`, `setTheme`, `seedVisualFixture` into `e2e/visual/helpers.ts` (import `seedVisualFixture` from `fixtures.ts`) so both specs share them.

- [ ] **Step 2: Write the behavioural dashboard spec**

`e2e/dashboard.spec.ts` (part of the main suite, not the visual one):

- Search filters the list.
- Sorting by name re-orders and flips.
- The layout toggle switches list ↔ grid.
- The New menu creates a blank project (row count +1, named `New Project`).
- The New folder dialog creates a folder (assert the folder row count via the DB or a toast — Phase 1 has no folder UI, so assert through the `folders` table).
- Rename changes the row's name.
- Duplicate adds a `Copy of …` row.
- Delete removes the row immediately, with no confirmation dialog.
- The account menu signs out and lands on `/login`.
- The shutdown banner is absent by default on port 3000 and present on the banner server (port 3100, `SHUTDOWN_BANNER=true`) — covered by the `visual-banner` project.

- [ ] **Step 3: Verify**

```bash
pnpm test:e2e
pnpm test:visual -- --project=visual
```

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "test(e2e): dashboard behaviour and icon-DOM accessibility assertions"
```

---

### Task 18: Visual calibration and CI

Now the real work: render, diff, adjust, repeat. The budget is 0.15 %; the first run will be far off.

**Files:**
- Edit: `e2e/visual/helpers.ts` (add `movePointerAway` and `expectDashboardReady`)
- Rewrite: `e2e/visual/dashboard.spec.ts` (the eight-case gate suite)
- Create: `e2e/visual/banner.spec.ts`
- Create: `e2e/visual/calibrate.spec.ts` (local only)
- Edit: whatever calibration touches (expected: `globals.css`, `tokens.css`, the dashboard components)
- Edit: `.github/workflows/ci.yml`
- Edit: `zenno/plans/README.md` (record the final measured geometry)

**Interfaces:**
- Consumes: Tasks 1–17
- Produces: a green `pnpm test:visual`, a CI job that runs it and uploads artifacts

- [ ] **Step 1: Add the readiness helper**

`movePointerAway` already lives in `e2e/visual/helpers.ts` (Task 3) and is called at the end of `login()`. Append `expectDashboardReady`:
export async function expectDashboardReady(page: Page, rows: number): Promise<void> {
  await expect(page.getByRole("heading", { name: "Your Projects" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sort by Name/ })).toBeVisible();
  await expect(page.getByTestId("account-chip")).toBeVisible();
  if (rows === 0) {
    await expect(page.getByText("You don't have any projects yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start from Scratch" })).toBeVisible();
  } else {
    await expect(page.getByTestId(/^project-card-/)).toHaveCount(rows);
  }
}
```

- [ ] **Step 2: Write the eight-case gate suite**

Replace the Task 3 placeholder `e2e/visual/dashboard.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { compareAgainstReference, VISUAL_BUDGET } from "./compare";
import { seedVisualFixture, type Dataset } from "./fixtures";
import { expectDashboardReady, login, movePointerAway, setTheme } from "./helpers";

interface VisualCase {
  name: string;
  theme: "dark" | "light";
  dataset: Dataset;
  rows: number;
  act?: (page: Page) => Promise<void>;
}

const CASES: VisualCase[] = [
  { name: "dashboard--dark", theme: "dark", dataset: "dark", rows: 15 },
  {
    name: "dashboard--dark--import-menu",
    theme: "dark",
    dataset: "dark",
    rows: 15,
    act: async (page) => {
      await page.getByRole("button", { name: "Import" }).click();
      await expect(page.getByRole("menuitem", { name: "Import Folder" })).toBeVisible();
    },
  },
  {
    name: "dashboard--dark--new-menu",
    theme: "dark",
    dataset: "dark",
    rows: 15,
    act: async (page) => {
      await page.getByRole("button", { name: "New" }).click();
      await expect(page.getByRole("menuitem", { name: "New folder" })).toBeVisible();
    },
  },
  {
    name: "dashboard--dark--new-folder-dialog",
    theme: "dark",
    dataset: "dark",
    rows: 15,
    act: async (page) => {
      await page.getByRole("button", { name: "New" }).click();
      await page.getByRole("menuitem", { name: "New folder" }).click();
      await expect(page.getByRole("dialog", { name: "New folder" })).toBeVisible();
    },
  },
  { name: "dashboard--light", theme: "light", dataset: "light", rows: 17 },
  {
    name: "dashboard--light--row-menu",
    theme: "light",
    dataset: "light",
    rows: 17,
    act: async (page) => {
      // Ref 46 opens the menu on the first row ("New Project").
      await page.getByRole("button", { name: "New Project actions" }).first().click();
      await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    },
  },
];

for (const c of CASES) {
  test(c.name, async ({ page }) => {
    seedVisualFixture(c.dataset);
    await setTheme(page, c.theme);
    await login(page);
    await expectDashboardReady(page, c.rows);
    await c.act?.(page);
    // Radix highlights the item under the pointer; the captures have none.
    await movePointerAway(page);
    const result = await compareAgainstReference(page, c.name);
    console.log(`${c.name}: ${(result.ratio * 100).toFixed(3)} %`);
    expect(result.ratio).toBeLessThanOrEqual(VISUAL_BUDGET);
  });
}
```

`e2e/visual/banner.spec.ts` — the two baselines that need `SHUTDOWN_BANNER=true`, picked up by the `visual-banner` project on port 3100:

```ts
import { expect, test, type Page } from "@playwright/test";
import { compareAgainstReference, VISUAL_BUDGET } from "./compare";
import { seedVisualFixture, type Dataset } from "./fixtures";
import { expectDashboardReady, login, movePointerAway, setTheme } from "./helpers";

interface BannerCase {
  name: string;
  theme: "dark" | "light";
  dataset: Dataset;
  rows: number;
}

const CASES: BannerCase[] = [
  // Ref 1: dark, 15 rows, banner on.
  { name: "dashboard--dark--banner", theme: "dark", dataset: "dark", rows: 15 },
  // Ref 42 (21-01-54): light, empty state, banner on. The capture is signed
  // out; the chip area is masked (see e2e/baselines/README.md).
  { name: "dashboard--light--empty--banner", theme: "light", dataset: "empty", rows: 0 },
];

for (const c of CASES) {
  test(c.name, async ({ page }) => {
    seedVisualFixture(c.dataset);
    await setTheme(page, c.theme);
    await login(page);
    await expect(page.getByTestId("shutdown-banner")).toBeVisible();
    await expectDashboardReady(page, c.rows);
    await movePointerAway(page);
    const result = await compareAgainstReference(page, c.name);
    console.log(`${c.name}: ${(result.ratio * 100).toFixed(3)} %`);
    expect(result.ratio).toBeLessThanOrEqual(VISUAL_BUDGET);
  });
}
```

Both banner tests get `baseURL` 3100 from the project, so `login()` and the page render with the banner on. The datasets differ (15 rows vs empty), so each test re-seeds — that is why `workers: 1` is not optional.

- [ ] **Step 3: Write the calibration runner**

`e2e/visual/calibrate.spec.ts` (excluded from CI; run locally with `pnpm test:visual -- --project=visual -g calibrate`):

```ts
import { test } from "@playwright/test";
import { compareAgainstReference } from "./compare";
import { seedVisualFixture } from "./fixtures";
import { login, movePointerAway, setTheme } from "./helpers";

const CASES = [
  ["dashboard--dark", "dark"],
  ["dashboard--light", "light"],
  ["dashboard--dark--import-menu", "dark", "import-menu"],
  ["dashboard--dark--new-menu", "dark", "new-menu"],
  ["dashboard--dark--new-folder-dialog", "dark", "new-folder-dialog"],
  ["dashboard--light--row-menu", "light", "row-menu"],
] as const;

for (const [name, theme, action] of CASES) {
  test(`calibrate ${name}`, async ({ page }) => {
    seedVisualFixture(theme);
    await setTheme(page, theme);
    await login(page);
    if (action === "import-menu") {
      await page.getByRole("button", { name: "Import" }).click();
    } else if (action === "new-menu") {
      await page.getByRole("button", { name: "New" }).click();
    } else if (action === "new-folder-dialog") {
      await page.getByRole("button", { name: "New" }).click();
      await page.getByRole("menuitem", { name: "New folder" }).click();
    } else if (action === "row-menu") {
      await page.getByRole("button", { name: "New Project actions" }).first().click();
    }
    await movePointerAway(page);
    const result = await compareAgainstReference(page, name);
    console.log(`${name}: ${(result.ratio * 100).toFixed(3)} %`);
  });
}

// The banner cases need the other server:
//   pnpm test:visual -- --project=visual-banner -g calibrate
test("calibrate dashboard--dark--banner", async ({ page }) => {
  test.skip(test.info().project.name !== "visual-banner", "needs SHUTDOWN_BANNER=true");
  seedVisualFixture("dark");
  await setTheme(page, "dark");
  await login(page);
  const result = await compareAgainstReference(page, "dashboard--dark--banner");
  console.log(`dashboard--dark--banner: ${(result.ratio * 100).toFixed(3)} %`);
});
```

- [ ] **Step 4: Calibrate in this order**

Work through the diff artifacts one component at a time. The expected order of magnitude:

1. **Theme and tokens.** Verify `html.dark` / `:not(.dark)` produce the exact `--bg-app`, `--dashboard-card-bg`, `--border-outline`, `--project-list-divider` values. A wrong card background is a full-card diff.
2. **Page geometry.** Measure the rendered card's left/top/right insets against Appendix A. Adjust `p-2`, `ml-2`, `mt-0.5` until the card's top edge and left edge land on the reference's physical pixels. This is the single highest-leverage fix.
3. **Header.** Title position and weight, search pill width/position, toggle, Import, New. Use the browser's `getBoundingClientRect()` printed from the page and compare with Appendix A.
4. **Column header and rows.** 34 CSS header, a 50 CSS row box on a 51 CSS pitch (`divide-y` owns the 1 px), `px-5`, thumbnail 50×40, name/date columns.
5. **Menus and dialogs.** Position (bundle: Import `sideOffset` 9, New `sideOffset` 8, row menu `sideOffset` 9, all `align="end"`; account menu `side="top" sideOffset={9} align="start"`), width (`min-w-[200px]`), item height (h-10), surface colour (`--optionmenu-bg` + `shadow-menu`, `rounded-2xl`).
6. **Account chip.** Position below the card, avatar size, text sizes.
7. **Banner.** `dashboard--dark--banner` and `dashboard--light--empty--banner` only.

After each adjustment, re-run the calibration and record the ratio. Do not adjust the baselines — adjust the implementation.

- [ ] **Step 5: Tighten the masks**

If a reference is under budget only because of a mask that is too generous, shrink it. The thumbnail mask should be the smallest rectangle that covers the thumbnail plus its border. Record the final rectangles in `e2e/baselines/README.md`. The harness divides by *unmasked* pixels, so this step improves both the honesty and the sensitivity of the gate.

- [ ] **Step 6: Add the CI job**

In `.github/workflows/ci.yml`, after the `e2e` job:

```yaml
  visual:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: spektrum
          POSTGRES_PASSWORD: spektrum
          POSTGRES_DB: spektrum_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U spektrum"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v6
        with:
          node-version-file: .node-version
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Install Chromium
        run: pnpm exec playwright install --with-deps chromium
      - name: Build
        run: pnpm build
      - name: Migrate
        run: pnpm db:migrate
        env:
          DATABASE_URL: postgres://spektrum:spektrum@localhost:5432/spektrum_test
      - name: Seed owner and dark fixture
        run: pnpm --filter @spektrum/web visual:seed dark
        env:
          DATABASE_URL: postgres://spektrum:spektrum@localhost:5432/spektrum_test
          E2E_OWNER_EMAIL: owner@spektrum.local
          E2E_OWNER_PASSWORD: owner-password-123
      - name: Visual diff
        run: pnpm test:visual
        env:
          DATABASE_URL: postgres://spektrum:spektrum@localhost:5432/spektrum_test
          E2E_OWNER_EMAIL: owner@spektrum.local
          E2E_OWNER_PASSWORD: owner-password-123
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: visual-artifacts
          path: e2e/visual/artifacts/
          if-no-files-found: ignore
```

`visual:seed` creates the owner itself when missing (Task 7, Step 7 falls back to `createOwner`, exactly like `ci-seed.ts`), so the seed step is only a warm-up — every test re-seeds with its own dataset.

- [ ] **Step 7: Full gate**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e && pnpm test:visual
```

All green. `pnpm test:visual` prints a ratio ≤ 0.15 % for all eight baselines.

- [ ] **Step 8: Record the final geometry**

Update Appendix A of this plan with the *actual* rendered values (as opposed to the measured reference values), and note any residual diff hot-spots.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "test(visual): calibrate dashboard to the reference captures and gate CI"
```

---

## Appendix A — Measured geometry (physical px in the 2530×1380 captures; CSS = physical / 1.13)

| Element | Physical | CSS | Source |
|---|---|---|---|
| Chrome chrome | 64 left, 53 top | — | all refs |
| App region | 2466×1327 | 2182×1174 (DSF 1.13) | all refs |
| Card left edge | x=82 | 16.0 (`p-2` 8 + `ml-2` 8) | 12, 39 |
| Card right edge | x=2519 | 9.7 (`p-2` 8 + antialiasing) | 12, 39 |
| Card top edge (no banner) | y=64 | 9.7 (`p-2` 8 + `mt-0.5` 2) | 12, 39 |
| Card top edge (banner) | y=130 | 68.1 (`p-2` 8 + banner 50 + gap 8 + `mt-0.5` 2) | 1, 43 |
| Card bottom edge | y=1296 (1297 with card border) | — | 12, 39 |
| Header divider | y=134 | header 62 CSS + 1 px divider (`py-3` + 38 px controls) | 12, 39 |
| Column-header divider | y=174 | 34 CSS header (`py-2` + 18) + 1 px divider owned by row 1 | 12, 39 |
| Row dividers (dark, no banner) | 174, 231, 289, 347, 404, 462, 520, 577, 635, 693, 750, 808, 866, 923, 981 | 57.6 pitch = 51 CSS (50 box + 1 divider), 15 rows | 12 |
| Row dividers (dark, banner) | 200, 239, 297, 355, 412, 470, 527, 585, 643, 700, 758, 816, 873, 931, 989, 1046 | same pitch | 1 |
| Row dividers (light) | 134, 174, 231, …, 1038, 1096 | same pitch, 17 rows | 39 |
| Search pill | x 1793–2131, y 78–120 | 339×43 = **300×38** | 13 |
| Layout toggle | x 2146–2233, y 78–120 | 88×43 = 78×38 (76 + 2 border) | 13 |
| Import button | x 2248–2360, y 79–119 | 113×41 = 100×36 (`h-9`) | 13 |
| New button | x 2374–2496, y 79–119 | 123×41 = 109×36 (`h-9`) | 13 |
| Header gaps | 14–15 physical between controls | 12–13 CSS (`gap-3`) | 13 |
| Title `Your Projects` | x 105–228, y 91–108 | `px-5` inset, 18 px / 28 weight 600 | 12, 39 |
| Column header text | y 149–158 | 12 px font | 12, 39 |
| Row name | y 197–210 | 14 px font, weight 400 | 12, 39 |
| Row date | y 197–206 | 12 px font, weight 300, `w-20` right | 12, 39 |
| Import menu | x 2127–2359, y 130–229 | 211×91, right-aligned | 13 |
| New menu | x 2271–2497, y 129–283 | 206×141, right-aligned | 14 |
| Row menu | x 2270–2497, y 231–376 | ~206×132, right-aligned | 46 |
| New-folder dialog | x 971–1622, y 594–840 | 651×246 = **576×218** (`max-w-xl`), centred, radius 13.6 = `rounded-xl` | 15 |
| Dialog title glyphs | x 999–1099, y 629–643 | 18 px / 600 | 15 |
| Dialog description | x 998–1288, y 668–682 | 14 px | 15 |
| Dialog input | x 999–1594, y 705–747 | 596×43 = 527×38, fill `(10,10,10)` = `hsl(0 0% 3.9%)` | 15 |
| Dialog Cancel text | x 1387–1435, y 784–794 | ends 28 physical before the pill = px-4 + gap-2 | 15 |
| Dialog action pill | x 1463–1595, y 766–812 | 133×47 = 118×42 (`h-10 px-4`), fill `#8f8f8f` = white @ 50 % over `#1f1f1f` (disabled) | 15 |
| Banner | x 71–2521, y 62–117 | 2451×56 = 2168×50, 8 CSS side insets, 1 px border | 1, 43 |
| Banner close button | glyph x 2491–2500, y 86–94 | 32×32 box, `right-2`, vertically centred | 1 |
| Empty-state heading | x 1174–1427, y 369–385 | 16/24, centred on the card, 115 CSS below the column divider | 43 |
| Empty-state sub | x 1174–1426, y 413–426 | 14/20 weight 300 | 43 |
| Empty-state pill | x 1217–1384, y 458–498 | 168×41 = 149×36 | 43 |
| Account chip avatar | x 105–136, y 1318–1349 | 28×28 | 12, 39 |
| Account chip text | x 145–284, y 1318–1351 | 14 px / 12 px, two lines | 12, 39 |
| Account chip top | y=1309 | 12 CSS below the card (`mt-3`) | 12 |
| Row `⋯` trigger | icon dots x 2471–2485, centre y 202.5 | 34×34 (`p-2` + 18 px icon) inside a `py-2` cell = 50 CSS row | 12, 39 |
| Account menu item pitch | ~47 | 43 | 19, 43 |

## Appendix B — Fixture datasets

**Light (`dashboard--light`, ref 39)** — 17 rows, `New Project`×4 first:

| # | Name | Days ago | Renders |
|---|---|---|---|
| 1 | New Project | 2 | 2d |
| 2 | New Project | 2 | 2d |
| 3 | New Project | 18 | 18d |
| 4 | New Project | 28 | 28d |
| 5 | Challenge Me 3 | 183 | 6mo |
| 6 | Nouveau projet | 183 | 6mo |
| 7 | Copie de PRJ - LINEAR ALGEBRA - V2 | 183 | 6mo |
| 8 | Challenge Me 2 | 183 | 6mo |
| 9 | Lab 1 - Fibonacci Sequence | 183 | 6mo |
| 10 | Challenge Me 1 | 183 | 6mo |
| 11 | PRJ - LINEAR ALGEBRA - V2 | 183 | 6mo |
| 12 | PRJ - LINEAR ALGEBRA - V1 | 183 | 6mo |
| 13 | Nouveau projet | 183 | 6mo |
| 14 | Nouveau projet | 183 | 6mo |
| 15 | Nouveau projet | 183 | 6mo |
| 16 | Linear Algebra - PRJ | 183 | 6mo |
| 17 | Nouveau projet | 274 | 9mo |

**Dark (`dashboard--dark`, ref 12)** — 15 rows:

| # | Name | Days ago | Renders |
|---|---|---|---|
| 1 | New Project | 16 | 16d |
| 2 | New Project | 26 | 26d |
| 3 | Challenge Me 3 | 152 | 5mo |
| 4 | Nouveau projet | 183 | 6mo |
| 5 | Copie de PRJ - LINEAR ALGEBRA - V2 | 183 | 6mo |
| 6 | Challenge Me 2 | 183 | 6mo |
| 7 | Lab 1 - Fibonacci Sequence | 183 | 6mo |
| 8 | Challenge Me 1 | 183 | 6mo |
| 9 | PRJ - LINEAR ALGEBRA - V2 | 183 | 6mo |
| 10 | PRJ - LINEAR ALGEBRA - V1 | 183 | 6mo |
| 11 | Nouveau projet | 183 | 6mo |
| 12 | Nouveau projet | 183 | 6mo |
| 13 | Nouveau projet | 183 | 6mo |
| 14 | Linear Algebra - PRJ | 183 | 6mo |
| 15 | Nouveau projet | 274 | 9mo |

Row 15's 274-day offset rounds to `9mo` (`274 / 30.44 = 9.00`), which is why the dark capture ends on `9mo`.

## Appendix C — Copy sheet (verbatim; no other wording may appear)

`Your Projects` · `Search` · `Import` · `New` · `Name` · `Created` · `Import archive (.zip, .tar.gz)` · `Import Folder` · `Blank project` · `Example project` · `New folder` · `Rename` · `Duplicate` · `Delete` · `Edit project name` · `Enter a new name for your project.` · `Cancel` · `Save` · `Create a folder to organize your projects.` · `Create folder` · `You don't have any projects yet` · `Start with a hosted project on Prism` · `Start from Scratch` · `Prism will shut down on January 1, 2027. Export your Prism projects before the shutdown date to keep a copy of your files.` · `Open export settings` · `Migration guide` · `Settings` · `Keyboard shortcuts` · `Give feedback` · `Sign out` · `Personal workspace` · `No projects match your search.` (D25) · `Light` · `Dark` · `System` (ThemeSwitcher, not in any Phase 1 capture)

`aria-label`s: `Search`, `List view`, `Grid view`, `Import`, `New`, `Sort by Name`, `Sort by Created`, `<project name> actions`, `Close`, `Interface theme`.

## Appendix D — Explicitly deferred

| Feature | Phase | Why |
|---|---|---|
| Folder grouping and display in the list | 5 | The captures show a flat list; folders are created but not rendered |
| Import archive / Import Folder | 5 | Needs archive extraction and object storage |
| Editor navigation from a row | 2 | No editor route yet; Phase 1 rows are inert on click |
| Settings modal, keyboard shortcuts, feedback | 2 | The account menu items are present but their destinations are Phase 2 |
| Example project content | 2 | Phase 1 creates an empty project; the template arrives with the editor |
| Banner destinations | 5 | Export settings and the migration guide are external |
| Theme switcher mount | 2 | The component and persistence land in Phase 1; the settings modal mounts it |
