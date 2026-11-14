# Visual baselines

Reference screenshots captured from prism.openai.com (see `zenno/specs/2026-11-07-spektrum-design.md` §2.1/§2.5). These are the only baselines: they are committed here and nothing is fetched at test time. Copies are byte-identical to the sources in `~/Pictures/Screenshots/` (sha256-verified).

## Geometry

Every capture is **2530×1380 physical**; the app region is **2466×1327 at DSF 1.13** (2182×1174 CSS), crop `(64, 53, 2530, 1380)` — the browser chrome occupies 64 px left (Chrome's vertical tab strip) and 53 px top (toolbar). References are compared 1:1, never rescaled.

## Mapping

| Baseline | Spec §2.1 row | Source file | What it shows |
|---|---|---|---|
| `reference/dashboard--dark.png` | 12 | `screenshot-2026-11-05_21-24-40-google-chrome.png` | Dashboard, dark, populated with project rows, search pill, list/grid toggle, Import + New buttons, account chip (server port 3000, fixture `dark`) |
| `reference/dashboard--dark--banner.png` | 1 | `screenshot-2026-11-05_21-22-28-google-chrome.png` | Dashboard, dark, with the shutdown banner (server port 3100, `SHUTDOWN_BANNER=true`, fixture `dark`) |
| `reference/dashboard--dark--import-menu.png` | 13 | `screenshot-2026-11-05_21-24-49-google-chrome.png` | Dashboard, dark, Import menu open (fixture `dark`) |
| `reference/dashboard--dark--new-menu.png` | 14 | `screenshot-2026-11-05_21-24-53-google-chrome.png` | Dashboard, dark, New menu open (fixture `dark`) |
| `reference/dashboard--dark--new-folder-dialog.png` | 15 | `screenshot-2026-11-05_21-25-10-google-chrome.png` | Dashboard, dark, New folder dialog over the scrim (fixture `dark`) |
| `reference/dashboard--light.png` | 39 | `screenshot-2026-11-07_21-01-02-google-chrome.png` | Dashboard, light, populated with project rows, search pill, list/grid toggle, Import + New buttons, user chip bottom-left (fixture `light`) |
| `reference/dashboard--light--row-menu.png` | 46 | `screenshot-2026-11-07_21-06-09-google-chrome.png` | Dashboard, light, project list with the row `⋯` menu open: Rename / Duplicate / Delete (fixture `light`) |
| `reference/dashboard--light--empty--banner.png` | 42 | `screenshot-2026-11-07_21-01-54-google-chrome.png` | Dashboard, light, empty state ("You don't have any projects yet") + shutdown banner, menu closed (server port 3100, `SHUTDOWN_BANNER=true`, fixture `empty`); doubles as the light-theme banner check, which row 1 cannot provide |
| `reference/editor--dark--blank.png` | 18 | `screenshot-2026-11-05_21-28-32-google-chrome.png` | Editor, dark, blank `main.tex` open, pre-compile right pane (`Initializing...`), composer `Getting ready...` (fixture `editor`) |
| `reference/editor--light--blank.png` | 40 | `screenshot-2026-11-07_13-04-25-google-chrome.png` | Editor, light, blank `main.tex` open, same pre-compile state (fixture `editor`) |
| `reference/settings--editor--dark.png` | 2 | `screenshot-2026-11-05_21-22-51-google-chrome.png` | Settings modal, dark, Editor section (fixture `dark`) |
| `reference/settings--pdf-viewer--dark.png` | 3 | `screenshot-2026-11-05_21-23-04-google-chrome.png` | Settings modal, dark, PDF Viewer section (fixture `dark`) |
| `reference/settings--file-management--dark.png` | 4 | `screenshot-2026-11-05_21-23-08-google-chrome.png` | Settings modal, dark, File Management section (fixture `dark`) |
| `reference/settings--data-controls--dark.png` | 5 | `screenshot-2026-11-05_21-23-21-google-chrome.png` | Settings modal, dark, Data Controls section (fixture `dark`) |
| `reference/settings--beta--dark.png` | 6 | `screenshot-2026-11-05_21-24-32-google-chrome.png` | Settings modal, dark, Beta features section (fixture `dark`) |
| `reference/settings--integrations--dark.png` | 7 | `screenshot-2026-11-05_21-24-36-google-chrome.png` | Settings modal, dark, Integrations section (fixture `dark`) |

Phase 3: the right pane is the real viewer; the two Phase 2 editor baselines are masked on the sheet/pill (the pane is in the no-render state).

### Deliberate exclusions

- **No signed-in empty-state capture exists.** Both empty-state captures (`21-01-54`, `21-02-07`) are the **signed-out** dashboard: the bottom-left chip reads `Sign in` with the OpenAI mark, and `21-02-07` additionally has the account menu open. `21-01-54` (menu closed) is used, with the chip area masked; the signed-in chip itself is covered by row 39 (`dashboard--light`). The spec's §2.1 rows 42/43 label these two files the wrong way round — Task 1 fixes the labels.
- **No dashboard account-menu capture exists.** The only user-menu capture is `21-25-52`, which is the **editor** (`Ready when you are!`, file tree, PDF), not the dashboard. Diffing it against the dashboard could never pass, so the account menu is verified behaviourally (Task 15) and by hand during Task 18; §15.1's gate lists `1, 12–15, 39, 46` and never included it.

## Mask table

Rectangles are written **`x0,y0 → x1,y1`** (exclusive `x1`/`y1`), in **full-capture physical coordinates**; the harness converts them to app-region offsets at load time:

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
| `settings--*--dark.png` (all six) | four disjoint strips around `753,309 → 1838,1124` | everything outside the 960×720 modal is a blurred dashboard screenshot; the OS toast (x 2107–2529, y 0–111) falls inside the top strip, so no fifth rect is needed |
| `editor--dark--blank.png`, `editor--light--blank.png` | none | neither capture contains the OS toast (verified by sampling x 2050–2530, y 0–120); an empty mask is correct — a toast rect would blank the real header and PDF top |

## Phase 2 ratios (single geometry pass, 2026-11-13)

| Baseline | Ratio | Budget | Result |
|---|---|---|---|
| `editor--dark--blank` | 1.883 % | ≤ 0.150 % | not met |
| `editor--light--blank` | 1.579 % | ≤ 0.150 % | not met |
| `settings--editor--dark` | 3.310 % | ≤ 0.150 % | not met |
| `settings--pdf-viewer--dark` | 1.369 % | ≤ 0.150 % | not met |
| `settings--file-management--dark` | 2.457 % | ≤ 0.150 % | not met |
| `settings--data-controls--dark` | 1.119 % | ≤ 0.150 % | not met |
| `settings--beta--dark` | 1.479 % | ≤ 0.150 % | not met |
| `settings--integrations--dark` | 1.875 % | ≤ 0.150 % | not met |

All eight are above the 0.15 % budget; the target is a recorded measurement, not a CI gate (`visual` stays `continue-on-error`). The pass fixed one structural defect — the editor resolved `interfaceTheme: "system"` as dark, rendering a black Monaco surface in the light baseline (40.8 %); resolving the theme from the applied `html` class brought the light editor to 1.474 %.

Three things about these rectangles are not arbitrary:

- **The toast really is only 62 px tall inside the app region.** The browser chrome ends at y=53; the toast panel is x 2107–2529, y 0–102 with a shadow to y≈111, so `y1=115` covers it with a little slack. Do not mask the whole top-right: the Import/New buttons and the segmented control are the point of this baseline.
- **Every baseline with project rows masks the thumbnail column.** The references show real Prism page previews; the fixtures have no thumbnail, so our rows render Prism's default thumbnail. The strip is deliberately generous (55 px box + 6 px each side, every row from the column-header bottom to the card bottom); Task 18 tightens it.
- **`dashboard--light--empty--banner` masks the bottom-left corner, not the empty state.** The signed-out chip and its menu-free area are the only unreproducible parts; the empty-state cluster in the middle of the card is fully gated, and so is the light banner.


## Phase 3 (compile + PDF + logs)

| Baseline | Capture | What it shows | Ratio (2026-11-14) |
|---|---|---|---|
| `pdf--dark--compiled` | 18 | Editor + compiled PDF | 4.706 % |
| `pdf--light--search` | 41 | Light editor, PDF search pill | 3.681 % |
| `pdf--dark--more-menu` | 31 | PDF ⋯ menu | 4.758 % |
| `pdf--dark--zoom-menu` | 32 | PDF zoom menu | 4.747 % |
| `editor--light--context-menu` | 40 | Light editor context menu | 3.833 % |
| `logs--dark--default` | 29 | Logs panel | 31.691 % |
| `logs--dark--filter-menu` | 30 | Logs filter menu (custom dropdown; the case currently times out on the item locator) | 30.889 % |
| `info--dark--project-info` | 23 | Project Info cards | 13.943 % |
| `info--dark--versions` | 26 | Versions list | 14.755 % |
| `info--dark--comments` | 28 | Comments empty state | 32.439 % |
| `share--dark` | 35 | Share dialog | 91.300 % |

Re-measured after the Phase 4 composer/placeholder change (2026-11-14); the baseline images are unchanged (references are immutable), only these ratios moved.

Masks (full-capture physical): the sheet `{1748,190,765,1110}` (below the chrome, so the pill/menus stay gated) and the composer `{442,1265,1047,70}` for the editor/PDF cases; the Info panel content `{1748,190,765,900}` for Project Info/Versions; the whole background for the Share dialog. The Ratios are a measurement, not a gate (`visual` stays `continue-on-error`); the info/logs/share calibration is the remaining Phase 3 visual work.

## Phase 4 (composer, transcript, diff)

Prism's captures predate the chat UI, so these have **no immutable reference**.
`recordRatio` captures each one and logs its size without comparing it; they are
never a gate (`visual` stays `continue-on-error`).

| Baseline | What it shows | Size (physical) |
|---|---|---|
| `composer--dark--empty` | Composer empty state (Ready + Review paper), dark | 2466×1327 |
| `composer--light--empty` | Same, light | 2466×1327 |
| `composer--dark--thread` | Transcript with a user/assistant turn, dark | 2466×1327 |
| `composer--light--thread` | Same, light | 2466×1327 |
| `diff--dark--default` | Inline Monaco diff with Accept/Reject/Accept all, dark | 2466×1327 |
| `diff--light--default` | Same, light | 2466×1327 |

Slot geometry (Appendix D, D86): the empty state keeps the 88 px composer slot;
a thread with parts gives the transcript a `min(45vh, 420px)` scrollable area and
a 64 px composer rect (§6.4). The a11y walk asserts no emoji and only 16×16
`currentColor` registry icons across the composer, transcript and diff.
