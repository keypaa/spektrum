# Prism editor UI — measured evidence

Captured 2026-11-05/07 from `prism.openai.com` at **2530×1380 physical, DSF 1.13**
(app region `2466×1327` = `2182×1174` CSS, origin `(64, 53)`). Every number below is
measured from the PNGs or quoted from the bundle with its offset; nothing is inferred
from the spec's earlier (wrong) DPR.

Sources:

| Ref | File | Shows |
|---|---|---|
| E1 | `screenshot-2026-11-07_13-04-25-google-chrome.png` | editor, light, blank `main.tex` |
| E2 | `screenshot-2026-11-05_21-28-32-google-chrome.png` | editor, dark, blank `main.tex` |
| E3 | `screenshot-2026-11-05_21-22-51-google-chrome.png` | settings, Editor section |
| E4–E9 | `…21-23-04`, `21-23-08`, `21-23-21`, `21-24-32`, `21-24-36` | settings, other five sections |

Bundle: `zenno/recon/js/36qcv_qj-yoz-.js` (offsets are character offsets into that file).

---

## 1. Geometry

### 1.1 Three columns (E1, E2)

| Region | Physical | CSS | How measured |
|---|---|---|---|
| App left edge | 64 | — | Chrome vertical tab strip ends |
| Sidebar | 64–564 | **442** | E1 row y=400: sidebar fill `#f1f1f1` ends at x=564 |
| Centre | 565–1747 | **1047** (flex) | E1: white editor field starts x=565 |
| Right pane | 1748–2512 | **677** | E1: pane fill `#f1f1f1` resumes at x=1748 |
| Page scrollbar strip | 2513–2529 | **16** | E1 row y=400: white 2513–2521, `#f1f1f1` 2522–2529 |
| Editor field (Monaco) right edge | 1722 | — | vertical rule at x=1723–1737 (E1 y=400) |

The three columns sum to **2166 CSS**; the app region is 2182. The missing 16 px is the
page scrollbar strip, and the grid must reserve it explicitly or the pane lands 16 px right.

### 1.2 Vertical structure of the centre column (E1/E2)

Full-width horizontal rules in x 660–1720 (both captures agree):

| y (physical) | Meaning |
|---|---|
| 53–61 | page background above the card (`#f1f1f1` light / `#161616` dark) |
| 62 | card top; the header block begins |
| 63–134 | header, upper row (tab row) — 72 px |
| 135–136 | 2 px rule, x 642–1723 (`#eeeeee` light / `#282828` dark) |
| 137–154 | header, lower row (icon strip) — 18 px |
| 155–156 | 2 px rule, x 642–1737 |
| 157–1287 | Monaco editor field |
| 1288 | 1 px rule above the composer |
| 1289–1352 | composer block (**64 px**) |
| 1353–1371 | bottom page background (19 px) |

**The header block is 95 px physical = 84 CSS, not 48.** The spec's 48 came from the
wrong DPR and from counting only one of the two rows. Task 9 builds the header as
`64 CSS` (tab row) + `2 px` rule + `16 CSS` (icon strip) + `2 px` rule = `84 CSS`; the
plan's `48 px` placeholder is replaced by that.

### 1.3 Header, upper row — tabs (E1/E2)

- Row box: y 63–134 (**72 px physical = 64 CSS**); background `bg-bg-code`.
- Left icon column: x 565–642 (77 px = 68 CSS) holds `IconPanelLeftClose`
  (dark: x 586–597, y 94–104) and `IconRefresh` (x 630–643).
- Active tab (E1): x 665–778, y 78–119 (41 px physical ≈ 36 CSS tall), fill
  `bg-bg-code`, 2 px top rule `--tabs-border-active`, label 12/16.
- Inactive tab: transparent, text `--fg-tertiary`.
- Close `×`: 12 px glyph at the tab's right edge, hover/active only.
- Right side: `Tools` pill at x 1647–1738, y 78–119, `--button-primary-bg`, 12/16
  weight 500, `IconTools` 14 px.
- Horizontal overflow: `overflow-x-auto`, no wrap.

### 1.4 Header, lower row — icon strip (E1/E2)

- 18 px physical = 16 CSS, between the two rules, x 642–1737.
- Contains a single icon at x 604–609 (E1: `#0e2471`, a blue glyph; E2: grey), i.e. the
  row is otherwise empty in the blank capture. Its label is not recoverable from the
  capture; Task 9 renders the row as an empty 16 CSS spacer and Task 20 decides whether
  an icon belongs there. Cost if wrong: one 16 px row differs in the visual diff.

### 1.5 Composer (E1/E2)

- Slot: y **1288–1352**; a 1 px rule at y=1288, the composer block y 1289–1352
  (**64 px physical = 56.6 CSS**), then the page background from y=1353.
- Horizontal: x **584–1724** (E2 y=1330), i.e. the centre column (565–1747) minus
  **19–23 px physical ≈ 18.5 CSS** each side.
- Fill: `#161616` dark (E2) / `#fdfdfd`→`#ffffff` light (E1), 1 px `--ai-border`,
  `rounded-3xl` (24 px).

> **Ruling (Task 1):** the capture's composer block is **64 physical px ≈ 57 CSS**, not
> 88 CSS (88 CSS would be 99 physical). The spec's "88 px (input 64 + 24 px margins)" is
> the *slot* height and was derived at the wrong DPR. Task 9 sizes the slot to `88 CSS` so
> the flex-1 editor area keeps the spec's proportions, and centres the 57 CSS composer in
> it; Task 20 reconciles the residual against the capture. Cost if wrong: a few px of
> composer offset in the visual diff, which is the accepted measurement target.

### 1.6 Sidebar (E1/E2)

| Element | Physical | CSS | Note |
|---|---|---|---|
| Card top padding | y 62–79 | 16 | `bg-bg-sidepanel` starts at y=62 |
| Project header row | y 80–160 | 71 | name + chevron at x 604–643, avatar at 1655–1738 |
| `Files`/`Chats` row | y 161–224 | 56 | bundle: `h-10` (40) + `mt-3` (12) + `pt-1.5` |
| Search input | y 227–265 | 34 | 32 px field + 2 px border, x 604–1712 |
| File rows | 32 CSS pitch | 32 | bundle: `h-8` |
| Bottom user chip | 56 CSS | 56 | bundle: `h-14` |

Bundle quotes (offsets):

- `@523301` `Personal workspace` — the chip's second line.
- `@1270642` `Files` / `@1270794` `Chats` — the tab row:
  `"flex h-10 items-start pt-1.5 text-sm transition-colors cursor-pointer"`, active
  `text-text-editor-primary`, inactive `text-text-editor-secondary
  hover:text-text-editor-primary`; underline `"border-b-2 pb-1"` +
  `border-text-editor-primary` / `border-transparent`; wrapper `"px-4 mt-3"`.
- `@1272361` file row: `"group flex items-center gap-2 px-3 py-2 rounded-lg text-sm
  text-left transition-colors cursor-pointer"`, active `bg-nav-bg-active
  text-text-editor-primary`, idle `text-text-editor-secondary hover:text-text-editor-primary
  hover:bg-[color:var(--nav-bg-hover-strong)]`.
- `@1002108` settings list `overflow-x-auto`; the editor's file list is the
  `overflow-y-auto px-4 pb-4` container at `@1272361`.

### 1.7 Right pane (E1/E2, pre-compile state)

- Pane = `bg-bg-code`, with **8 CSS top and bottom padding only** (strips y 62–70 and
  y 1365–1371; the sheet spans the full pane width — no side padding).
- Sheet = `bg-bg-preview`, `rounded-t-lg`, from y 71 to y 1364 (`absolute inset-x-0
  top-2 bottom-2` semantics). Dark sheet is white (`--bg-preview` is undefined in the
  dark block, falls to `:root` `neutral-50`); light sheet is `#f1f1f1`.
- **PDF topbar** (`056lqy1-luum3.js` @113182): `flex w-full items-center bg-transparent
  px-2 pt-2 pb-2`; only the compile pill renders pre-compile (page controls/zoom/download
  are `numPages`-gated). Pill at x 1757–1930, y 80–122 (36 CSS + border = h-9): the
  bundle's compile control is `rounded-full border border-border-preview overflow-hidden`
  with a main button (`px-3`, spinner 16 + label `Initializing...`, text-sm) and a menu
  button (`h-9 w-7`, `border-l border-border-preview`, `IconChevronDown`).
- **Centered placeholder** (`056lqy1-luum3.js` @113308): `flex grow h-full w-full items-center
  justify-center gap-3 p-8` with `IconSpinner` (`h-4 w-4 animate-spin`, aria-hidden) +
  `Initializing...` (`text-xs font-medium text-text-editor-quaternary`). Measured text
  x 2110–2182, y 741–751; light spinner x 2079–2094.
- **Floating bottom bar** = `CrixetPDFPanelToolbar` (`056lqy1-luum3.js` @52600): `rounded-full
  px-3 py-2 bg-ai-bg shadow-[0_7px_24px_rgba(0,0,0,0.25)]`, contents `[undo][redo]` (`c`) +
  `[goto-file]` `Go to PDF` `[arrow]` (`h`), `gap-1`. Measured bar box x 2012–2248
  (209 CSS), y 1302–1353 (46 CSS), centered at the pane's x-centre, bottom inset ≈ 19 CSS
  above the sheet bottom (y 1372). Fill `bg-ai-bg` (dark `#161616`, light `#fff`).

Everything is inert (`aria-disabled` buttons where a control would act); `data-testid="pdf-pane"`.
A comment marks it as the Phase 3 mount point.

### 1.8 Settings modal (E3)

| Region | Physical | CSS |
|---|---|---|
| Modal | x 753–1838, y 309–1124 | **960 × 720** (1085×815 physical measured; the 1 px difference is the 1 px border) |
| Left nav | x 753–1024 | **240** |
| Content pane | x 1025–1838 | 720 |
| Nav fill | `#161616` | `bg-bg-app` |
| Content fill | `#1f1f1f` | `bg-modal-bg` |

Bundle quotes:

- `@1001313` `"min-w-0 w-[calc(100vw-32px)] max-w-[960px] h-[min(720px,calc(100vh-32px))]"`
  — confirms **960×720**, `p-0 overflow-hidden rounded-2xl bg-modal-bg md:rounded-[24px]`.
- `@1001500` nav: `"w-full max-w-full shrink-0 overflow-hidden bg-bg-app p-3 pr-14
  md:w-[240px] md:overflow-visible md:p-6"` — confirms **nav 240** and `bg-bg-app`.
- `@1001800` content: `"min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4
  text-text-editor-primary sm:p-6 md:p-8"`, inner `max-w-2xl flex flex-col gap-6`.
- `@1001900` section title: `"text-2xl font-normal"`.
- `@1001950` rows are a flat `flex flex-col` list of `kG … k7` — one component per control.

---

## 2. Colour values (sampled)

| Token | Light | Dark |
|---|---|---|
| `bg-app` | `#f1f1f1` | `#161616` |
| `bg-code` | `#ffffff` | `#000000` |
| `bg-sidepanel` | `#f1f1f1` | `#161616` |
| `bg-preview` | `#f1f1f1` | `#161616` |
| `bg-modal` | `#1f1f1f` | `#1f1f1f` |
| rule under tab strip | `#eeeeee` | `#282828` |
| settings nav | `#161616` | `#161616` |

`bg-modal` is `#1f1f1f` in **both** themes (E3 is the dark capture; the light settings
capture `21-22-58` samples the same value). `bg-app` is `#161616` in dark, which is why
the settings nav (`bg-bg-app`) and the modal content (`bg-modal-bg`) differ by one step.

---

## 3. Icon registry additions (Phase 2)

Consumed by Tasks 9–18, all on the §5.8 16×16 grid, `currentColor`, `strokeWidth 1.5`:

`IconChevronLeft` · `IconFolder` · `IconFolderPlus` · `IconFile` · `IconFileTex` ·
`IconFileBib` · `IconFileImage` · `IconFileCsv` · `IconChat` · `IconRefresh` ·
`IconPanelLeftClose` · `IconTools` · `IconMic` · `IconArrowUp` · `IconStop` ·
`IconPaperclip` · `IconSparkle` · `IconPencil` · `IconTrash` · `IconFit` · `IconBraces` ·
`IconDatabase` · `IconBeta` · `IconIntegrations` · `IconSpinner`.

The bundle's own glyphs are 14–20 px and inline; we redraw them, we do not copy them.

---

## 4. Class strings later tasks cite

Sidebar container (bundle `@1272361` area):

```
flex flex-col grow min-h-0
```

File row (`@1272361`, `rounded-lg text-sm`):

```
group flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left
transition-colors cursor-pointer
active:  bg-nav-bg-active text-text-editor-primary
idle:    text-text-editor-secondary hover:text-text-editor-primary
         hover:bg-[color:var(--nav-bg-hover-strong)]
```

Chats row (`@1272700`):

```
group flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left
```

Tab strip (`@1892563` is the file-picker popover; the tab strip itself is the
`border-b border-border-log` strip above the editor):

```
flex h-full min-h-0 min-w-0 flex-col
```

Composer (`@1326243`):

```
flex flex-row items-center pl-4 pr-1.5 py-1.5
min-h-[132px]        (voice-expanded only; the resting composer has no min-h)
m-1  (m-2 when open)
rounded-3xl
bg-ai-bg
```

Composer wrapper (`@1892563`):

```
grow flex flex-row justify-center items-center gap-1 overflow-hidden
p-3
bg-ai-bg border-t border-border-log shadow-[0_-8px_24px_rgba(0,0,0,0.12)]
```

Settings nav item (`@1002000`):

```
w-auto shrink-0 px-3 py-2 font-normal text-nowrap md:w-full md:pl-2 md:pr-3
active:   bg-nav-bg-active text-text-nav-primary rounded-lg
inactive: text-text-nav-tertiary hover:text-text-nav-primary rounded-lg
```

Settings close button (`@1001450`):

```
absolute right-4 top-4 z-10 bg-bg-app md:bg-transparent
```

Tools pill (`@1911909`, `Uz`):

```
cursor-pointer bg-bg-code flex-none flex justify-center items-center
  inner: px-3 py-2 flex flex-inline items-center gap-2 rounded-xl transition-colors
         bg-tools-bg  / hover:bg-tools-bg-hover
  label: text-sm font-medium select-none text-tools-text / hover:text-tools-text-hover
```

---

## 5. What the bundle does **not** contain

- `Ask anything`, `Thinking:`, `Getting ready...`, `Ready when you are!` — the composer
  copy in the bundle is translation-keyed (`t("…")`), so the rendered strings in the
  captures come from the translation JSON, not this chunk. Appendix C records the rendered
  copy; Task 16 uses `Getting ready...` (D32) and `Thinking: <level>` (spec §6.4).
- No `max-w-[960px]` other than the settings modal, and no `h-[720px]` — the height is
  `h-[min(720px,calc(100vh-32px))]` (quoted above).
- The `diagram.jpg` row in the settings captures is a masked, unreproducible thumbnail
  (Task 2); the example template still references the file (Phase 5 seeds it).