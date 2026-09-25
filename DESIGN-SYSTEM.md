# BorgDock Design System

A reference for BorgDock's visual language — for designers, design tools (Claude Design, Figma plugins, token translators), and anyone building UI in `src/BorgDock.Tauri`.

BorgDock is a dense, desktop-native developer tool. The visual language is the **Workbench** direction (`plans/ui-overhaul-workbench.md`): graphite surfaces in dark, porcelain in light, one indigo accent used for selection and the single primary action, and a three-colour status palette. Inter for the shell and lists, Instrument Sans for reading views, JetBrains Mono only in code.

Current as of the phase 6 UI overhaul (2026-09-25). Mockups: `design/mockups/borgdock-redesign-iteration-2.html`. The short version of this document is `BorgDock-Styling-Guide.md`.

---

## 1. Design Principles

1. **Dense but breathable.** Lists and chrome at 13 px, status bars at 11 px, tight padding, hairlines between groups.
2. **The accent has one job.** Indigo marks selection and the one primary action. Other hues carry meaning (status, diffs, merged).
3. **Status has three colours.** Success green, error red, warning amber, rendered as a soft tint with a matching border and full-strength foreground.
4. **Surfaces over shadows.** Depth comes from `surface-raised` / `surface-hover` and 1 px hairlines. Shadows (`--elevation-*`) are for floating UI: flyout, toasts, modals, popovers.
5. **Both themes are first-class.** Every colour is a token with a `.dark` value; components never carry literals (a unit test enforces it).
6. **Motion answers the user.** Every transition uses a `--motion-*` token and collapses under reduced motion.
7. **Primitives first.** Use `components/shared/primitives` and the shared chrome before writing a new control.

---

## 2. Architecture

| Layer | Where | What |
|---|---|---|
| Tokens | `src/styles/index.css` `:root` / `.dark` | Colour, elevation and scale custom properties |
| Motion tokens | `src/styles/motion.css` | `--motion-*`, `--ease-*`, reduced motion, view-transition and window-entrance keyframes |
| Tailwind bridge | `src/styles/index.css` `@theme inline` | Re-exports colours, spacing, radius, text, duration, fonts as utilities |
| Component classes | `src/styles/index.css` `@layer components` | `.bd-*` classes backing the primitives, plus feature families (`bd-fp-*`, `bd-fv-*`, `bd-wt-*`, `bd-wp-*`, `bd-wi-*`, `bd-code-*`) |
| Workbench stylesheets | `src/styles/{focus,work-items,worktrees}-workbench.css`, `src/styles/tool-windows.css` | Main-window sections; tool-window pieces (segmented control, toggle, wizard progress, What's new hero, work item palette, flyout panel) |
| Legacy / unlayered | `src/styles/index.css` | `.sql-*` (SQL window), `.markdown-body`, `.tactile-icon-btn`, diff preview / find strip |
| Feature stylesheet | `src/components/focus/quick-review.css` | `.qr-*` for the Quick Review overlay |
| Primitives | `src/components/shared/primitives/` | React components selecting `.bd-*` classes via `clsx` |

**Theme switching** (`src/utils/theme.ts`, one helper for every window):

- `applyTheme(settings | { theme, reduceMotion })` sets `.dark`, `.reduce-motion` and `color-scheme` on `<html>`, and writes `localStorage['borgdock-theme']` (the setting: `light`, `dark` or `system`) and `localStorage['borgdock-reduce-motion']` (`1` / `0`).
- `resolveTheme(setting)` resolves `system` through `matchMedia('(prefers-color-scheme: dark)')`; `watchSystemTheme(cb)` reports OS changes.
- `startWindowTheme()` is called once in every tool-window entry (`*-main.tsx`): it applies the saved settings, re-applies on `settings:ui-changed` (emitted by the settings store on save, from any window) and follows the OS while the theme is `system`. The Settings window also previews edits before they save; the flyout applies the theme its payload carries.
- `public/theme-boot.js` is the pre-paint script every HTML entry (including `settings.html`) loads in `<head>`. It reads the two keys with the same rules, so a window never flashes the other theme; `src/utils/__tests__/theme.test.ts` runs it against `applyTheme`.
- The main window uses `hooks/useTheme.ts`, a thin hook over the same helper.

---

## 3. Color Tokens

All names below omit the `--color-` prefix. Values are **light (porcelain) / dark (graphite)**, from `index.css`.

### 3.1 Accent

| Token | Light | Dark | Role |
|---|---|---|---|
| `accent` | `#4f46e5` | `#7f7eff` | Selection bar, primary button fill, focus ring |
| `accent-foreground` | `#ffffff` | `#12121a` | Text / icon on an accent fill |
| `accent-subtle` | `rgba(79,70,229,.10)` | `rgba(127,126,255,.15)` | Selection / active wash |
| `accent-soft` | `rgba(79,70,229,.06)` | `rgba(127,126,255,.08)` | Faint accent tint |
| `purple` | `#4f46e5` | `#9d9cff` | The accent as text on a wash (active chip, selected id) |
| `purple-soft` | `rgba(79,70,229,.06)` | `rgba(127,126,255,.08)` | Tinted surface |
| `purple-border` | `rgba(79,70,229,.16)` | `rgba(127,126,255,.22)` | Tinted border |

**Accent foreground.** White on the dark accent `#7f7eff` is only 3.3:1, so in dark mode `accent-foreground` is a dark ink (`#12121a`, 5.6:1); light mode keeps white on `#4f46e5` (6.3:1). Every surface that puts text on the accent (primary buttons and their `Kbd` hints, checkboxes, the CodeMirror autocomplete selection, confirm buttons, badges) uses `accent-foreground`, never a literal white. `contrast.test.ts` checks it in both themes.

### 3.2 Surfaces

| Token | Light | Dark | Role |
|---|---|---|---|
| `background` | `#f5f5f7` | `#151618` | Window background |
| `surface` | `#ffffff` | `#1b1c1f` | Panels, cards, bars |
| `surface-raised` | `rgba(23,24,28,.03)` | `#212226` | Subtle lift |
| `surface-hover` | `rgba(23,24,28,.04)` | `rgba(255,255,255,.028)` | Row hover wash |
| `card-background` | `#ffffff` | `#1b1c1f` | Card fill |
| `card-border` | `#e5e6ea` | `rgba(255,255,255,.065)` | Card edge |
| `seg-highlight` | `#ffffff` | `#28292e` | Sliding highlight fill (segmented controls, rail) |
| `selected-row-bg` | `rgba(79,70,229,.07)` | `rgba(127,126,255,.10)` | Selected row |

### 3.3 Text

| Token | Light | Dark | Use |
|---|---|---|---|
| `text-primary` | `#17181c` | `#ededef` | Titles, row titles, body |
| `text-secondary` | `#5d606a` | `#9c9da4` | Labels, secondary copy |
| `text-muted` | `#6b6e78` | `#8e8f96` | Small readable text: hints, counts, status bars, key chips (≥ 4.5:1) |
| `text-tertiary` | `#6d707a` | `#82838a` | Tertiary copy, icons, carets (≥ 4.5:1 on background and surface) |
| `text-faint` | `#c2c4cb` | `#3f4046` | Disabled glyphs |
| `text-ghost` | `#dcdee3` | `#2c2d32` | Placeholders for shapes |

### 3.4 Borders

| Token | Light | Dark |
|---|---|---|
| `subtle-border` / `separator` | `#e5e6ea` | `rgba(255,255,255,.065)` |
| `strong-border` | `#d4d6dc` | `rgba(255,255,255,.12)` |
| `input-border` | `#dcdee4` | `rgba(255,255,255,.09)` |

### 3.5 Status

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `status-green` | `#1f9d6b` | `#5cc98f` | Passing, approved, success |
| `status-red` | `#d64560` | `#f0616d` | Failing, changes requested, error |
| `status-yellow` | `#c98a12` | `#e5b454` | Running, review required, warning |
| `status-gray` | `#8f929c` | `#67686f` | Neutral, skipped |
| `status-merged` | `#8250df` | `#a371f7` | Merged PRs |
| `status-amber` | `#d97706` | `#f0a04b` | Aging / attention |
| `status-blue` | `#2d6be4` | `#6fa8ff` | Informational |

**Solid status fills** (action pills, the flyout banner) put `status-fill-foreground` (dark ink, both themes) on the green and amber fills, and `danger-fill-foreground` on the error red (`error-badge-fg`); white on the porcelain green or amber is under 4.5:1.

**Tone triples** — `{success,warning,error,neutral,draft}-badge-{bg,fg,border}`: a 7–10% tint, a full-strength foreground (light warning and error foregrounds are darkened to clear 4.5:1) and a 16–25% border.

### 3.6 Chrome, overlays and tool windows

| Token | Light | Dark |
|---|---|---|
| `title-bar-bg` | `rgba(255,255,255,.88)` | `rgba(27,28,31,.85)` |
| `status-bar-bg` | `rgba(245,245,247,.88)` | `rgba(21,22,24,.70)` |
| `overlay-bg` | `rgba(16,18,27,.35)` | `rgba(0,0,0,.60)` |
| `modal-bg` | `#ffffff` | `#1b1c1f` |
| `input-bg` | `#ffffff` | `rgba(255,255,255,.035)` |
| `toggle-knob` | `#ffffff` | `#ffffff` |
| `code-block-bg` | `#f0f1f4` | `#151618` |
| `code-selection` | `rgba(79,70,229,.16)` | `rgba(127,126,255,.28)` |
| `chip-count-on-bg` | `rgba(23,24,28,.08)` | `rgba(255,255,255,.10)` |
| `stripe-overlay` | `rgba(255,255,255,.40)` | `rgba(255,255,255,.28)` |
| `find-match-bg` / `find-match-current-bg` | `rgba(201,138,18,.28)` / `.55` | `rgba(229,180,84,.26)` / `.50` |
| `status-fill-foreground` | `#12121a` | `#12121a` |
| `danger-fill-foreground` | `#ffffff` | `#12121a` |

### 3.7 Diff

- Added — `diff-added-{bg,bg-highlight,gutter-bg}`: tints of `status-green` (the word highlight is 14% light / 16% dark so syntax colours stay above 4.5:1)
- Deleted — `diff-deleted-{bg,bg-highlight,gutter-bg}`: tints of `status-red`
- `diff-context-bg` (transparent), `diff-hunk-header-bg`, `diff-hunk-header-text`, `diff-line-number`, `diff-file-header-{bg,border}`, `diff-border`

### 3.8 Syntax (Tree-sitter diff view, file viewer, SQL editor)

Tuned for graphite and porcelain: every token clears 4.5:1 on `background`, `surface` and `code-block-bg`, and on the added / deleted diff lines including the word highlights, in its theme (`contrast.test.ts` composites the diff overlays over the background).

| Token | Role | Light | Dark |
|---|---|---|---|
| `syntax-keyword` | `if`, `fn`… | `#6b3fd4` | `#b4a8ff` |
| `syntax-string` | strings | `#136c49` | `#7fd6a8` |
| `syntax-comment` | comments | `#5d5f68` | `#9698a0` |
| `syntax-number` | numbers | `#8b5200` | `#f0bd6b` |
| `syntax-type` | types, classes | `#0a6879` | `#6cc6d8` |
| `syntax-function` | functions | `#2d56c8` | `#8fb4ff` |
| `syntax-variable` | identifiers | `#17181c` | `#ededef` |
| `syntax-operator` | operators | `#5d606a` | `#9c9da4` |
| `syntax-punctuation` | punctuation | `#5d5f68` | `#97989e` |
| `syntax-constant` | `true`, `null` | `#aa2f65` | `#f08bb6` |
| `syntax-property` | properties | `#1d5c96` | `#a9c7f0` |
| `syntax-tag` | JSX/HTML tags | `#af2c48` | `#f07d8c` |
| `syntax-attribute` | attributes | `#8b5200` | `#f0bd6b` |
| `syntax-plain` | fallback | `#17181c` | `#ededef` |

### 3.9 Small Groups

- **Toasts** — `toast-bg`, and per severity `toast-{success,error,warning,info,merged}-{glow,stripe,icon-bg}`
- **What's New** — `whats-new-{new,improved,fixed}-{fg,bg,border}`, `whats-new-rail`
- **Scrollbar** — `scrollbar-thumb`, `scrollbar-thumb-hover`
- **Wizard** — `wizard-step-{active,complete,inactive,track}` (the sliding progress track)
- **Brand gradients** — `splash-gradient-end`, `logo-gradient-{start,end}`

---

## 4. Scale Tokens

Scale tokens live on `:root` and are not themed (except elevation).

### 4.1 Spacing

| Token | Value | Tailwind |
|---|---|---|
| `--space-1` | 2px | `p-1`, `gap-1` |
| `--space-2` | 4px | `p-2` |
| `--space-3` | 6px | `p-3` |
| `--space-4` | 8px | `p-4` |
| `--space-5` | 10px | `p-5` |
| `--space-6` | 12px | `p-6` |
| `--space-8` | 16px | `p-8` |
| `--space-10` | 20px | `p-10` |
| `--space-12` | 24px | `p-12` |

> Only these nine steps are overridden. Any other step falls back to Tailwind's 4px multiplier (`p-1.5` = 6px, `p-7` = 28px), so the scale isn't monotonic. Stick to the steps above.

### 4.2 Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 5px | Buttons, chips, inputs |
| `--radius-md` | 6px | Window controls, segmented items |
| `--radius-lg` | 8px | Cards, panels |
| `--radius-xl` | 12px | Large surfaces |
| `--radius-pill` | 9999px | Pills, dots, avatars |

### 4.3 Typography

Self-hosted variable fonts via `@fontsource-variable` (bundled into `dist/`, no network).

| Token | Family | Where |
|---|---|---|
| `--font-ui` → `font-sans` | Inter | `body`; the shell, lists, chrome and every tool window |
| `--font-reading` → `font-reading` | Instrument Sans | PR detail, work item detail, Quick Review, the What's new reading view |
| `--font-code` → `font-mono` | JetBrains Mono | Code, diffs, paths, SQL results, `Kbd` chips |

| Token | Size | Usage |
|---|---|---|
| `--text-micro` | 10px | Key chips, dense meta |
| `--text-small` | 11px | Status bars, pills, meta |
| `--text-body` | 12px | Buttons, secondary copy |
| `--text-base` | 13px | Lists, title bars, body |
| `--text-title` | 18px | Page titles |

Labels are sentence case; there are no uppercase tracked headings. Numbers in lists and status bars use tabular numerals.

### 4.4 Motion

`src/styles/motion.css`:

| Token | Value | Usage |
|---|---|---|
| `--motion-fast` | 150ms | Hover, press, chip colour, toggle knob |
| `--motion-base` | 260ms | Fades, section / settings / wizard-step crossfades, tool-window entrance |
| `--motion-move` | 320ms | Sliding highlights, FLIP reorders, wizard progress |
| `--motion-push` | 360ms | View push / pop, the What's new hero reveal |
| `--motion-expand` | 340ms | Grid-row expansion |
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` | Enter, expand, push |
| `--ease-std` | `cubic-bezier(.2,.8,.2,1)` | Move, reflow, highlight |
| `--ease-in` | `cubic-bezier(.4,0,1,1)` | Leave, dismiss, pop |

The older `--duration-press` (80ms), `--duration-color` (120ms), `--duration-ui` (150ms), `--duration-tab` (200ms) and `--duration-breath` (2600ms) stay for components not yet migrated.

**Reduced motion:** `@media (prefers-reduced-motion: reduce)` and `html.reduce-motion` (Settings → Appearance → Reduce motion) set every `--motion-*` to 0.01ms and stop looping animations. `motionOK()` in `src/utils/motion.ts` reads the same two signals and gates `flip()`, `flipIfSmall()` (FLIP that skips lists over 150 rows) and `withViewTransition()`.

**Tool-window entrance:** `revealWindow()` in `src/utils/window-reveal.ts` invokes `window_ready` and, once it settles, plays `.bd-window-enter` on `#root` (fade and scale from 0.98 over `--motion-base`). Until then `#root` holds the first frame (`.bd-window-pending`). The file viewer, built visible, calls `playWindowEnter()` on mount. Nothing is added under reduced motion.

### 4.5 Elevation

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--elevation-1` | `0 1px 2px rgba(16,18,27,.04)` | `…rgba(0,0,0,.2)` | Toggle knob, card hover |
| `--elevation-2` | `0 8px 32px rgba(16,18,27,.14)` | `…rgba(0,0,0,.4)` | Flyout panel, popovers, pickers |
| `--elevation-3` | `0 20px 60px rgba(16,18,27,.28)` | `…rgba(0,0,0,.6)` | Modals, menus |

Elevation isn't exported to Tailwind; use `shadow-[var(--elevation-2)]` or CSS.

### 4.6 Focus

- Pressables: `outline: 2px solid var(--color-accent)`; `outline-offset: -2px` inside rows and segmented controls, `1px` elsewhere
- Inputs: border colour shifts to `--color-accent`

---

## 5. Tailwind Integration

`index.css` contains an `@theme inline` block:

- `--color-*: initial` removes Tailwind's default palette, so only BorgDock colors generate utilities
- Utility names are the token name minus `--color-`, which doubles some words: `bg-surface`, `bg-accent`, `bg-status-green`, **`text-text-primary`**, **`border-subtle-border`**
- Also exported: `spacing-*`, `rounded-{sm,md,lg,xl,pill}`, `text-{micro,small,body,base,title}`, `duration-*`, `font-sans`, `font-mono`
- Not reset: Tailwind's default text sizes (`text-xs`…), shadows, line-heights, tracking
- No `@custom-variant dark` — `dark:` would follow the OS media query, not the `.dark` class. Rely on tokens instead of `dark:`.

**Preferred order when styling:**
1. A primitive from `shared/primitives`
2. Semantic utilities (`bg-surface text-text-secondary rounded-lg text-small`)
3. `[var(--color-…)]` arbitrary values when no utility exists
4. A `.bd-*` class in `@layer components` for dense feature layout

---

## 6. Components

### 6.1 Primitives — `src/components/shared/primitives/`

Named exports from `primitives/index.ts`. Each selects `.bd-*` classes with `clsx`; no cva / tailwind-merge. All but HoverPopover, SectionHeader, and Select have unit tests in `primitives/__tests__/`.

| Primitive | API | CSS |
|---|---|---|
| `Button` | `variant` primary / secondary / ghost / danger (dashed red); `size` sm 24px / md 28px / lg 32px; `leading`, `trailing`, `loading` | `.bd-btn` — 12px/500, radius-sm, scale .97, disabled opacity .5 |
| `IconButton` | `icon`, `active`, `tooltip` (native title), `size` 22 / 26 / 30 | `.bd-icon-btn` |
| `Pill` | `tone` success / warning / error / neutral / draft / ghost / merged; `icon`; emits `data-pill-tone` | `.bd-pill` — 20px, 11px/600 |
| `Chip` | filter chip: `active`, `count`, `tone` neutral / error | `.bd-chip` — 24px, 12px |
| `Dot` | `tone` green / red / yellow / gray / merged; `pulse`; `size` | `.bd-dot` — 8px |
| `Card` | `variant` default / own; `padding` sm 8 / md 10 / lg 16; `interactive` | `.bd-card` |
| `Avatar` | `initials`, `tone` own / them / blue / rose, `size` sm 20 / md 24 / lg 28 | `.bd-avatar` (gradient fills) |
| `Ring` | readiness ring: `value` 0–100, `size`, `stroke`, `label` | `.bd-ring`, `--ring-size` |
| `LinearProgress` | `value`, `tone` accent / success / warning / error | `.bd-linear` — 4px |
| `SegmentedProgress` | `passed`, `running`, `total`; striped running segment | — |
| `Tabs` | `value`, `onChange`, `tabs: {id,label,count,indicator}[]`, `dense` | `.bd-tabs` — 2px underline, 200ms |
| `Seg2` | segmented control: `value`, `options`, `size` sm / md, `full`, `ariaLabel`; the highlight slides (`SlidingHighlight`) | `.bd-filter.bd-seg` |
| `SlidingHighlight` | `activeKey`, `variant` fill / underline; items carry `data-highlight-key` | `.bd-slide` |
| `ProgressButton` | `Button` that fills while `state` is busy and flips to `doneLabel` (`useProgressAction`) | `.bd-progress-btn` |
| `CheckBar` | check count plus proportional bar | `.bd-checkbar` |
| `Input` | native input + `leading` / `trailing` | `.bd-input` — 28px |
| `TextInput` | controlled; `type` text / password / number; `mono`, `suffix` | `.bd-input` |
| `Select` | native select with Lucide chevron | — |
| `Checkbox` | `checked`, `label`, `hint` | — |
| `Toggle` / `ToggleRow` | switch, knob slides over `--motion-fast`; row adds `label`, `hint` | `.bd-toggle` |
| `Slider` | `min`, `max`, `step`, `suffix`, `format` | — |
| `Field` | `label`, `hint`, `dense`, `anchorId` (settings search target) | — |
| `SectionHeader` | `title`, `subtitle`, `badge` | — |
| `Kbd` | keyboard hint | `.bd-kbd` |
| `HoverPopover` | fixed-position hover content | inline styles |
| `TitleBar` | `title`, `count`, `meta`, `left`, `middle`, `right` | `.bd-title-bar` — 36px, blur 16px |
| `WindowControls` | min / max / close for the main window | `.bd-wc` |

### 6.2 Chrome & Shared — `src/components/shared/`

| Component | Notes |
|---|---|
| `chrome/WindowControls` | Callback-based min / max / close for pop-out windows |
| `chrome/WindowStatusBar` | `left`, `right`, `hints` (`Kbd` chips with a label); `.bd-statusbar` 28px, one top hairline, Inter 11px, tabular numerals. Shared with the main window. |
| `WindowTitleBar` | Every tool window's title bar: logo, `title` (string or node), `meta`, `actions`, window controls, optional `onClose`. `.bd-title-bar` 36px, Inter 13px, one bottom hairline, the same bar as the main window's. |
| `ConfirmDialog` | `variant` danger / default; focus-trapped |
| `Markdown` / `MarkdownImage` | `.markdown-body`; images open full size |
| `ErrorBoundary` | Per-window error boundary |
| `icons/BorgDockLogo`, `RefreshIcon` (spinning), `SettingsIcon` | Brand and animated icons |

### 6.3 Icons

- **Lucide** (`lucide-react`) everywhere, imported directly — no wrapper
- Common sizes: 10–13px inline, 22px for larger affordances
- Stroke width is set per call site; `strokeWidth={2.25}` is the most common choice for small icons (~59 of 160 explicit uses) — prefer it for consistency
- Brand marks live in `shared/icons/`

### 6.4 Feature Surfaces

| Surface | Location | Window / entry |
|---|---|---|
| Main window (Focus / PRs / Work Items), status bar | `components/layout/` | `index.html` → `main.tsx` |
| PR list, cards, toolbar, review load, T3 checkout dialog | `components/pr/` | main |
| Focus list, Quick Review overlay, merge toast | `components/focus/` | main |
| PR detail (tabs, action bar, checkout, composer, diff) | `components/pr-detail/` (`diff/` subdir) | `pr-detail.html` |
| Tray flyout, flyout toasts | `components/flyout/` | `flyout.html` |
| Work items workspace & detail | `components/work-items/` | main, `workitem-detail.html` |
| Work item palette | `components/work-item-palette/` | `work-item-palette.html` |
| Worktree palette | `components/worktree-palette/` | `worktree.html` |
| File palette, code view | `components/file-palette/` | `file-palette.html` |
| File viewer | `components/file-viewer/` | `file-viewer.html` |
| SQL window | `components/sql/` | `sql.html` |
| Settings window, sections, dialogs | `components/settings/` | `settings.html` |
| What's New | `components/whats-new/` | `whats-new.html` |
| Setup wizard | `components/wizard/` | main |
| Onboarding (FeatureBadge, InlineHint, FirstRunOverlay) | `components/onboarding/` | main |
| Worktree prune dialog | `components/worktree/` | settings |

### 6.5 Still Ad-hoc

Candidates for new primitives:

| Pattern | Current implementations |
|---|---|
| Dialog / Modal | Only `ConfirmDialog` is shared; `ConnectionEditorDialog`, `RepoScanDialog`, `SelfTestResultsDialog`, `SaveSnippetDialog`, `T3CheckoutDialog`, `WorktreePruneDialog` each roll their own. `.bd-modal` is used once. |
| Context menu | `PrContextMenu`, `FlyoutPrContextMenu`, `FilePaletteContextMenu`, `ChipPicker`, `WorkItemFilterPopover` |
| Tooltip | Native `title`, `HoverPopover`, or `InlineHint` |
| Skeleton | `FlyoutInitializing`, `PrList`, `WorktreePaletteApp` |
| Toast | `FlyoutToast` and `MergeToast` |
| Badges | `LabelBadge`, `MergeScoreBadge`, `LinkedWorkItemBadge` beside `Pill` |
| Chips | `work-item-palette/FilterChip` and `ChipInput` beside `Chip` |
| Window controls | `primitives/WindowControls` and `chrome/WindowControls` overlap |

---

## 7. Patterns

### 7.1 Picking a color
1. State (success / warning / error / merged) → status tokens; brand or interaction → accent / purple.
2. Fill → `{tone}-badge-bg`; text on it → `{tone}-badge-fg`; edge → `{tone}-badge-border`.
3. No fitting token? Add one to `:root` **and** `.dark`, then to `@theme inline`.

### 7.2 Status pill
```tsx
<Pill tone="success" icon={<Check size={11} strokeWidth={2.25} />}>Approved</Pill>
```

### 7.3 Button row
```tsx
<Button variant="primary" size="md" leading={<GitMerge size={12} />}>Merge</Button>
<Button variant="ghost" size="md">Open in browser</Button>
<Button variant="danger" size="sm">Close PR</Button>
```

### 7.4 Custom pressable (when no primitive fits)
```css
.bd-my-thing {
  border-radius: var(--radius-sm);
  transition: background var(--duration-color) ease, color var(--duration-color) ease,
    transform var(--duration-press) ease;
}
.bd-my-thing:hover:not(:disabled) { background: var(--color-surface-hover); }
.bd-my-thing:active:not(:disabled) { transform: scale(0.97); }
.bd-my-thing:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
```

### 7.5 Floating panel
```css
.bd-my-float {
  background: var(--color-surface);
  border: 1px solid var(--color-strong-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--elevation-2);
}
```

---

## 8. Storybook

- Config: `src/BorgDock.Tauri/.storybook/` — Tauri APIs mocked via `.storybook/mocks/`, `index.css` loaded, light / dark / system theme toolbar applied through the same `applyTheme` as the app
- Every window has a `ThemeLight` / `ThemeDark` pair (`globals: { theme }`): settings (Appearance panel), SQL, file palette, file viewer, work item palette, worktree window, flyout, work item detail and PR detail pop-outs, What's new; the setup wizard has one story per step in both themes (`wizard/SetupWizard.stories.tsx`)
- Side by side in both themes (`BothThemes` from `src/test-support/story-themes.tsx`): `Shared/Primitives`, `Shared/WindowChrome` (title and status bars), `Settings/AppearanceSection`
- Hero screenshots for release notes come from these stories (`scripts/screenshot-stories.mjs` + `design/whats-new/<version>.heroes.json`)

---

## 9. Machine-Readable Tokens (DTCG subset)

```json
{
  "color": {
    "accent":         { "$value": "#4f46e5", "$type": "color", "$extensions": { "dark": "#7f7eff" } },
    "accent-foreground": { "$value": "#ffffff", "$type": "color", "$extensions": { "dark": "#12121a" } },
    "background":     { "$value": "#f5f5f7", "$type": "color", "$extensions": { "dark": "#151618" } },
    "surface":        { "$value": "#ffffff", "$type": "color", "$extensions": { "dark": "#1b1c1f" } },
    "text-primary":   { "$value": "#17181c", "$type": "color", "$extensions": { "dark": "#ededef" } },
    "text-secondary": { "$value": "#5d606a", "$type": "color", "$extensions": { "dark": "#9c9da4" } },
    "text-tertiary":  { "$value": "#6d707a", "$type": "color", "$extensions": { "dark": "#82838a" } },
    "text-muted":     { "$value": "#6b6e78", "$type": "color", "$extensions": { "dark": "#8e8f96" } },
    "status-green":   { "$value": "#1f9d6b", "$type": "color", "$extensions": { "dark": "#5cc98f" } },
    "status-red":     { "$value": "#d64560", "$type": "color", "$extensions": { "dark": "#f0616d" } },
    "status-yellow":  { "$value": "#c98a12", "$type": "color", "$extensions": { "dark": "#e5b454" } },
    "status-merged":  { "$value": "#8250df", "$type": "color", "$extensions": { "dark": "#a371f7" } },
    "subtle-border":  { "$value": "#e5e6ea", "$type": "color", "$extensions": { "dark": "rgba(255,255,255,0.065)" } },
    "strong-border":  { "$value": "#d4d6dc", "$type": "color", "$extensions": { "dark": "rgba(255,255,255,0.12)" } }
  },
  "dimension": {
    "space-1": { "$value": "2px",  "$type": "dimension" },
    "space-2": { "$value": "4px",  "$type": "dimension" },
    "space-3": { "$value": "6px",  "$type": "dimension" },
    "space-4": { "$value": "8px",  "$type": "dimension" },
    "space-5": { "$value": "10px", "$type": "dimension" },
    "space-6": { "$value": "12px", "$type": "dimension" },
    "space-8": { "$value": "16px", "$type": "dimension" },
    "radius-sm":   { "$value": "5px",    "$type": "dimension" },
    "radius-md":   { "$value": "6px",    "$type": "dimension" },
    "radius-lg":   { "$value": "8px",    "$type": "dimension" },
    "radius-xl":   { "$value": "12px",   "$type": "dimension" },
    "radius-pill": { "$value": "9999px", "$type": "dimension" },
    "text-micro": { "$value": "10px", "$type": "dimension" },
    "text-small": { "$value": "11px", "$type": "dimension" },
    "text-body":  { "$value": "12px", "$type": "dimension" },
    "text-base":  { "$value": "13px", "$type": "dimension" },
    "text-title": { "$value": "18px", "$type": "dimension" }
  },
  "duration": {
    "press":  { "$value": "80ms",   "$type": "duration" },
    "color":  { "$value": "120ms",  "$type": "duration" },
    "ui":     { "$value": "150ms",  "$type": "duration" },
    "tab":    { "$value": "200ms",  "$type": "duration" },
    "breath": { "$value": "2600ms", "$type": "duration" },
    "motion-fast":   { "$value": "150ms", "$type": "duration" },
    "motion-base":   { "$value": "260ms", "$type": "duration" },
    "motion-move":   { "$value": "320ms", "$type": "duration" },
    "motion-push":   { "$value": "360ms", "$type": "duration" },
    "motion-expand": { "$value": "340ms", "$type": "duration" }
  }
}
```

---

## 10. Known Gaps

### Adoption
- **Semantic utilities are barely used.** Components reach tokens through ~790 `*-[var(--…)]` arbitrary classes and ~330 inline `style` `var()` strings; `text-text-muted` appears 11 times.
- **Arbitrary sizes win over tokens.** `text-[11px]` (87), `text-[10px]` (63), `text-[13px]` (45), plus off-scale `text-[11.5px]` / `text-[10.5px]`; `text-micro/small/body` utilities have 0 uses. Tailwind default `text-xs`, `rounded-md`, `shadow-xl` are common.
- **Colours in CSS** — components are literal-free (`src/styles/__tests__/component-colors.test.ts`), but a few CSS rules still carry literals: avatar gradients (`.bd-avatar--*`), the window-close red, the splash (`public/entry/splash.css`).
- **`text-tertiary` passes AA since 3.0.0** (`#6d707a` / `#82838a`, ≥ 4.5:1 on background and surface in both themes, checked by `contrast.test.ts`). On `surface-raised` it is still below 4.5:1 in dark; readable text there uses `text-muted`.

### Token Hygiene
- **Unused tokens (~57)**: floating-badge set (`badge-glass`, `badge-surface`, `badge-border`, `badge-glow-*`), all `review-*`, `whats-new-*` fg/bg/border, `tracked-*` / `working-on-*`, `tab-active/inactive`, `pr-badge-*`, `pr-my-badge-*`, `branch-badge-*`, `target-badge-*`, `comment-count-fg`, several `action-*` and `check-*`, `avatar-text`, `expanded-row-bg`, `diff-hunk-header` (duplicate), `syntax-tag/attribute/plain`, `radius-md/xl`, `space-10/12`, `text-title`, `duration-breath`
- **Dead CSS**: `.sidebar-*` block (and its `sidebar-gradient-*` tokens), `.field-input`, and six unused keyframes (`toast-progress-shrink`, `notifPop`, `scale-in`, `comment-enter`, `fadeSlideIn`, `slideInRight`)
- **Aliases**: `bg-primary` duplicates `background`
- **Undefined references**: `--color-app-background` (PR detail fixture)
- **Two window-control families**: `.bd-wc` (36×28) and `.bd-window-control` (28×24)

### Missing
- No `forced-colors` handling
- No line-height, font-weight or focus-ring tokens
- Spacing scale gaps (see §4.1)
- No `dark:` variant bound to `.dark`
- Primitives still missing for Dialog, Menu, Tooltip, Skeleton, Toast (see §6.5)

---

## 11. Source of Truth

- Tokens, `@theme`, component classes: `src/BorgDock.Tauri/src/styles/index.css`
- Quick Review styles: `src/BorgDock.Tauri/src/components/focus/quick-review.css`
- Primitives: `src/BorgDock.Tauri/src/components/shared/primitives/`
- Motion tokens and helpers: `src/BorgDock.Tauri/src/styles/motion.css`, `src/BorgDock.Tauri/src/utils/motion.ts`, `src/BorgDock.Tauri/src/utils/window-reveal.ts`
- Theme helper: `src/BorgDock.Tauri/src/utils/theme.ts` (hook: `src/hooks/useTheme.ts`; pre-paint: `public/theme-boot.js`)
- Contrast checks: `src/BorgDock.Tauri/src/styles/__tests__/contrast.test.ts` (reads `index.css`), `tests/e2e/tool-windows-a11y.spec.ts` (axe, both themes); token-only guard: `src/styles/__tests__/component-colors.test.ts`
- Design specs & mockups: `docs/superpowers/specs/2026-04-24-shared-components-design.md`, `design/mockups/`, `design/quick-review/`
- Tray icons: rendered at runtime in `src-tauri/src/platform/tray.rs`; static icon assets in `src-tauri/icons/`
