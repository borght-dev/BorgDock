# BorgDock Design System

A reference for BorgDock's visual language — for designers, design tools (Claude Design, Figma plugins, token translators), and anyone building UI in `src/BorgDock.Tauri`.

BorgDock is a dense, desktop-native developer tool. The visual language is tuned for lots of information (many PRs, checks, rows) while still feeling warm and distinctive — never "bootstrap gray." The signature is **deep plum backgrounds with a violet accent** plus a muted aquamarine / ruby / amber status palette.

Current as of **2.3.1** (2026-09-15). Origin spec: `docs/superpowers/specs/2026-04-24-shared-components-design.md`; canonical mockup: `design/mockups/borgdock-streamline-redesign.html`.

---

## 1. Design Principles

1. **Dense but breathable.** Text is small (10–13px), padding is tight (4–10px), but whitespace separates logical groups. Don't hide information behind hover if it fits.
2. **Violet is the only chromatic accent.** Buttons, tabs, selection, and focus rings use the purple scale. Other hues carry meaning (status, diffs, merged).
3. **Status is duochrome.** Success = aquamarine, error = ruby, warning = amber — rendered as a soft tint (6–10% alpha) with a matching border (14–25% alpha) and full-strength foreground. No saturated fills.
4. **Surfaces over shadows.** Depth comes from `surface-raised` / `surface-hover` tints. Shadows (`--elevation-*`) are for floating UI: flyout, toasts, modals.
5. **Dark theme is first-class.** Every color token has a `.dark` override. Go through a token; don't hard-code hex.
6. **Tactile micro-motion.** Pressables scale to 0.90–0.97 with an 80ms transform and 120ms color transition.
7. **Primitives first.** Use `components/shared/primitives` before writing a new button, pill, card, or input.

---

## 2. Architecture

| Layer | Where | What |
|---|---|---|
| Tokens | `src/styles/index.css` `:root` / `.dark` | ~196 custom properties (167 colors, 3 elevations, 26 scale tokens) |
| Tailwind bridge | `src/styles/index.css` `@theme inline` | Re-exports 166 colors + spacing, radius, text, duration, fonts as utilities |
| Component classes | `src/styles/index.css` `@layer components` | `.bd-*` classes backing the primitives, plus feature families (`bd-fp-*`, `bd-fv-*`, `bd-wt-*`, `bd-wp-*`, `bd-wi-*`, `bd-code-*`) |
| Legacy / unlayered | `src/styles/index.css` | `.sql-*` (SQL window), `.markdown-body`, `.tactile-icon-btn`, diff preview / find strip |
| Feature stylesheet | `src/components/focus/quick-review.css` | `.qr-*` for the Quick Review overlay |
| Primitives | `src/components/shared/primitives/` | React components selecting `.bd-*` classes via `clsx` |

**Theme switching:** the `.dark` class on `<html>` (`hooks/useTheme.ts`; setting = system / light / dark, following `prefers-color-scheme` live). `.dark` also sets `color-scheme: dark`. No `data-theme`.

---

## 3. Color Tokens

All names below omit the `--color-` prefix. Values are **light / dark**.

### 3.1 Accent & Purple

| Token | Light | Dark | Role |
|---|---|---|---|
| `accent` | `#6655d4` | `#7c6af6` | Primary interactive color |
| `accent-foreground` | `#ffffff` | `#ffffff` | Text/icon on accent |
| `accent-subtle` | `rgba(124,106,246,.10)` | `rgba(124,106,246,.15)` | Hover / selection wash |
| `accent-soft` | `rgba(102,85,212,.06)` | `rgba(124,106,246,.08)` | Faint accent tint |
| `purple` | `#6655d4` | `#9384f7` | Purple scale anchor |
| `purple-soft` | `rgba(124,106,246,.06)` | `rgba(147,132,247,.08)` | Tinted surface |
| `purple-border` | `rgba(124,106,246,.14)` | `rgba(147,132,247,.20)` | Tinted border |

### 3.2 Surfaces

| Token | Light | Dark | Role |
|---|---|---|---|
| `background` | `#f7f5fb` | `#110f1a` | Window background |
| `bg-primary` | `#f7f5fb` | `#110f1a` | Alias of `background` |
| `surface` | `#ffffff` | `#1a1726` | Panels, cards |
| `surface-raised` | `rgba(90,86,112,.03)` | `rgba(138,133,160,.03)` | Subtle lift |
| `surface-hover` | `rgba(90,86,112,.05)` | `rgba(138,133,160,.05)` | Row hover |
| `card-background` | `#ffffff` | `#1a1726` | Card fill |
| `card-border` | `rgba(90,86,112,.08)` | `rgba(138,133,160,.08)` | Card edge |
| `card-border-my-pr` | `rgba(124,106,246,.22)` | same | Own-PR card edge (`.bd-card--own`) |

### 3.3 Text

Six steps; drop one per level of emphasis. `text-muted` is contrast-tested at 4.5:1 (`src/styles/__tests__/contrast.test.ts`).

| Token | Light | Dark |
|---|---|---|
| `text-primary` | `#1a1726` | `#edeaf4` |
| `text-secondary` | `#3a3550` | `#c8c4d6` |
| `text-tertiary` | `#5a5670` | `#8a85a0` |
| `text-muted` | `#6a6580` | `#9490a8` |
| `text-faint` | `#b8b0c8` | `#3a3650` |
| `text-ghost` | `#d8d4e3` | `#2a2640` |

### 3.4 Borders

| Token | Light | Dark |
|---|---|---|
| `subtle-border` | `rgba(90,86,112,.08)` | `rgba(138,133,160,.08)` |
| `separator` | `rgba(90,86,112,.08)` | `rgba(138,133,160,.08)` |
| `strong-border` | `rgba(90,86,112,.14)` | `rgba(138,133,160,.14)` |

### 3.5 Status

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `status-green` | `#3ba68e` | `#7dd3c0` | Passing, approved, success |
| `status-red` | `#c7324f` | `#e54065` | Failing, changes requested, error |
| `status-yellow` | `#b07d09` | `#f5b73b` | Pending, review required, warning |
| `status-gray` | `#8a85a0` | `#5a5670` | Neutral, skipped |
| `status-merged` | `#8250df` | `#a371f7` | Merged PRs |
| `status-amber` | `#d97706` | `#f59e0b` | Aging / attention |
| `status-blue` | `#2563eb` | `#60a5fa` | Informational |

**Tone triples** — `{tone}-badge-{bg,fg,border}`:

| Tone | bg | fg | border |
|---|---|---|---|
| `success` | `rgba(59,166,142,.07)` / `rgba(125,211,192,.10)` | status-green | `.18` / `.25` |
| `warning` | `rgba(176,125,9,.06)` / `rgba(245,183,59,.10)` | status-yellow | `.14` / `.15` |
| `error` | `rgba(199,50,79,.06)` / `rgba(229,64,101,.10)` | status-red | `.14` / `.20` |
| `neutral` | `rgba(124,106,246,.06)` / `rgba(147,132,247,.08)` | `#6655d4` / `#9384f7` | `.14` / `.20` |
| `draft` | `rgba(90,86,112,.05)` / `rgba(138,133,160,.08)` | `#8a85a0` / `#5a5670` | `.14` / `.20` |

**Glows & check rows:** `green-glow`, `red-glow`; `check-{passed,failed}-{bg,border}` (4–6% tint, 10–14% border).

### 3.6 Interactive

| Token | Light | Dark |
|---|---|---|
| `icon-btn-hover` | `rgba(90,86,112,.06)` | `rgba(138,133,160,.08)` |
| `icon-btn-pressed` | `rgba(90,86,112,.10)` | `rgba(138,133,160,.12)` |
| `icon-btn-fg` | `#5a5670` | `#8a85a0` |
| `action-secondary-fg` | `#6655d4` | `#9384f7` |
| `action-danger-bg` | `rgba(199,50,79,.06)` | `rgba(229,64,101,.10)` |
| `action-danger-fg` | `#c7324f` | `#e54065` |
| `input-bg` | `#ffffff` | `rgba(138,133,160,.04)` |
| `input-border` | `rgba(90,86,112,.12)` | `rgba(138,133,160,.10)` |
| `selected-row-bg` | `rgba(124,106,246,.06)` | same |
| `toggle-knob` | `#ffffff` | `#ffffff` |

### 3.7 Chrome & Overlays

| Token | Light | Dark |
|---|---|---|
| `title-bar-bg` | `rgba(247,245,251,.88)` | `rgba(26,23,38,.80)` |
| `status-bar-bg` | `rgba(247,245,251,.88)` | `rgba(17,15,26,.60)` |
| `overlay-bg` | `rgba(0,0,0,.35)` | `rgba(0,0,0,.65)` |
| `modal-bg` | `#ffffff` | `#1a1726` |
| `modal-border` | `rgba(90,86,112,.10)` | `rgba(138,133,160,.10)` |

### 3.8 Toasts

- `toast-bg` — `rgba(255,255,255,.96)` / `rgba(26,23,38,.96)`
- Per severity `success | error | warning | info | merged`: `toast-{sev}-glow`, `toast-{sev}-stripe`, `toast-{sev}-icon-bg`
  - Stripes: `#3ba68e`/`#7dd3c0`, `#c7324f`/`#e54065`, `#d4960d`/`#f5b73b`, `#6655d4`/`#9384f7`, `#8250df`/`#a371f7`
  - Merged also has `toast-merged-icon-fg` and an animated `toast-merged-shimmer` gradient (not exported to Tailwind)

### 3.9 Diff

- Added — `diff-added-{bg,bg-highlight,gutter-bg}`: 7/20/5% green light, 10/25/6% dark
- Deleted — `diff-deleted-{bg,bg-highlight,gutter-bg}`: 6/18/4% red light, 10/22/6% dark
- `diff-context-bg` (transparent), `diff-hunk-header-bg`, `diff-hunk-header-text`, `diff-line-number`
- `diff-file-header-{bg,border}`, `diff-border`
- `code-block-bg` — `#f0ecf9` / `#110f1a`

### 3.10 Syntax (Tree-sitter)

| Token | Role | Light | Dark |
|---|---|---|---|
| `syntax-keyword` | `if`, `fn`… | `#6655d4` | `#b8b0f8` |
| `syntax-string` | strings | `#3ba68e` | `#7dd3c0` |
| `syntax-comment` | comments | `#8a85a0` | `#5a5670` |
| `syntax-number` | numbers | `#b07d09` | `#f5b73b` |
| `syntax-type` | types, classes | `#c7324f` | `#e54065` |
| `syntax-function` | functions | `#3a3550` | `#c8c4d6` |
| `syntax-variable` | identifiers | `#1a1726` | `#edeaf4` |
| `syntax-operator` | operators | `#5a5670` | `#8a85a0` |
| `syntax-punctuation` | punctuation | `#8a85a0` | `#5a5670` |
| `syntax-constant` | `true`, `null` | `#6655d4` | `#b8b0f8` |
| `syntax-property` | properties | `#3a3550` | `#c8c4d6` |
| `syntax-tag` | JSX/HTML tags | `#c7324f` | `#e54065` |
| `syntax-attribute` | attributes | `#b07d09` | `#f5b73b` |
| `syntax-plain` | fallback | `#1a1726` | `#edeaf4` |

### 3.11 Small Groups

- **What's New** — `whats-new-{new,improved,fixed}-{fg,bg,border}` (green / amber / purple), `whats-new-rail`
- **Scrollbar** — `scrollbar-thumb`, `scrollbar-thumb-hover`
- **Wizard** — `wizard-step-{active,complete,inactive,track}`
- **Brand gradients** — `splash-gradient-end`, `logo-gradient-{start,end}`
- **Other** — `avatar-text`, `badge-progress-track`

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

> ⚠️ Only these nine steps are overridden. Any other step falls back to Tailwind's 4px multiplier (`p-1.5` = 6px, `p-2.5` = 10px, `p-7` = 28px, `p-9` = 36px), so the scale isn't monotonic (`p-7` 28px > `p-8` 16px). Stick to the steps above.

### 4.2 Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 5px | Buttons, chips, inputs |
| `--radius-md` | 6px | Window controls |
| `--radius-lg` | 8px | Cards, panels |
| `--radius-xl` | 12px | Large surfaces |
| `--radius-pill` | 9999px | Pills, dots, avatars |

Modals and Focus rows use a literal 10px.

### 4.3 Typography

System fonts only; no webfonts.

| Token | Value |
|---|---|
| `--font-ui` → `font-sans` | `-apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif` |
| `--font-code` → `font-mono` | `"Cascadia Code", "Cascadia Mono", "Consolas", "Courier New", monospace` |

| Token | Size | Usage |
|---|---|---|
| `--text-micro` | 10px | Counters, dense meta |
| `--text-small` | 11px | Pills, toolbars, chips |
| `--text-body` | 12px | Buttons, card body, tabs |
| `--text-base` | 13px | Expanded content, card headings |
| `--text-title` | 18px | Window / page titles |

Weights (no tokens): 400 body, 500 labels and buttons, 600 pills and emphasis, 700 titles. Code views use `--code-line-height: 1.5`.

### 4.4 Motion

| Token | Value | Usage |
|---|---|---|
| `--duration-press` | 80ms | Press scale transform |
| `--duration-color` | 120ms | Background / color on pressables |
| `--duration-ui` | 150ms | Border, opacity |
| `--duration-tab` | 200ms | Tab underline (`ease-out`) |
| `--duration-breath` | 2600ms | Pulse / settle loops |

Press scales: `0.90` icon buttons, `0.92` window controls, `0.97` buttons. Easing is literal `ease` / `ease-out` (no tokens).

### 4.5 Elevation

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--elevation-1` | `0 1px 2px rgba(0,0,0,.04)` | `…rgba(0,0,0,.2)` | Interactive card hover |
| `--elevation-2` | `0 8px 32px rgba(26,23,38,.14)` | `…rgba(0,0,0,.4)` | Floating panels |
| `--elevation-3` | `0 20px 60px rgba(26,23,38,.28)` | `…rgba(0,0,0,.6)` | Modals |

Elevation isn't exported to Tailwind; use `shadow-[var(--elevation-2)]` or CSS.

### 4.6 Focus

- Pressables: `outline: 2px solid var(--color-accent); outline-offset: 1px` (`-2px` on window controls)
- Inputs: border color shifts to `--color-accent`

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
| `Seg2` | two-option segmented control | — |
| `Input` | native input + `leading` / `trailing` | `.bd-input` — 28px |
| `TextInput` | controlled; `type` text / password / number; `mono`, `suffix` | `.bd-input` |
| `Select` | native select with Lucide chevron | — |
| `Checkbox` | `checked`, `label`, `hint` | — |
| `Toggle` / `ToggleRow` | switch; row adds `label`, `hint` | — |
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
| `chrome/WindowStatusBar` | `left`, `right` slots; `.bd-statusbar` 26px |
| `WindowTitleBar` | Title + meta + window controls for pop-outs |
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
| Chips / segmented | `work-item-palette/FilterChip`, `ChipInput`, `GroupSeg` duplicate `Chip` / `Seg2` |
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

- Config: `src/BorgDock.Tauri/.storybook/` — Tauri APIs mocked via `.storybook/mocks/`, `index.css` loaded, light / dark / system theme toolbar
- 31 app- and feature-level stories: main window (`layout/MainWindow.stories.tsx`), flyout, Quick Review, palettes, file viewer, SQL, What's New, work items, PR detail (app, panel, every tab, checkout, checklist, composer), settings (app, every section, dialogs)
- Hero screenshots for release notes come from these stories (`scripts/screenshot-stories.mjs` + `design/whats-new/<version>.heroes.json`)
- No primitive or token stories yet

---

## 9. Machine-Readable Tokens (DTCG subset)

```json
{
  "color": {
    "accent":         { "$value": "#6655d4", "$type": "color", "$extensions": { "dark": "#7c6af6" } },
    "background":     { "$value": "#f7f5fb", "$type": "color", "$extensions": { "dark": "#110f1a" } },
    "surface":        { "$value": "#ffffff", "$type": "color", "$extensions": { "dark": "#1a1726" } },
    "text-primary":   { "$value": "#1a1726", "$type": "color", "$extensions": { "dark": "#edeaf4" } },
    "text-secondary": { "$value": "#3a3550", "$type": "color", "$extensions": { "dark": "#c8c4d6" } },
    "text-tertiary":  { "$value": "#5a5670", "$type": "color", "$extensions": { "dark": "#8a85a0" } },
    "text-muted":     { "$value": "#6a6580", "$type": "color", "$extensions": { "dark": "#9490a8" } },
    "status-green":   { "$value": "#3ba68e", "$type": "color", "$extensions": { "dark": "#7dd3c0" } },
    "status-red":     { "$value": "#c7324f", "$type": "color", "$extensions": { "dark": "#e54065" } },
    "status-yellow":  { "$value": "#b07d09", "$type": "color", "$extensions": { "dark": "#f5b73b" } },
    "status-merged":  { "$value": "#8250df", "$type": "color", "$extensions": { "dark": "#a371f7" } },
    "subtle-border":  { "$value": "rgba(90,86,112,0.08)", "$type": "color", "$extensions": { "dark": "rgba(138,133,160,0.08)" } },
    "strong-border":  { "$value": "rgba(90,86,112,0.14)", "$type": "color", "$extensions": { "dark": "rgba(138,133,160,0.14)" } }
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
    "breath": { "$value": "2600ms", "$type": "duration" }
  }
}
```

---

## 10. Known Gaps

### Adoption
- **Semantic utilities are barely used.** Components reach tokens through ~790 `*-[var(--…)]` arbitrary classes and ~330 inline `style` `var()` strings; `text-text-muted` appears 11 times.
- **Arbitrary sizes win over tokens.** `text-[11px]` (87), `text-[10px]` (63), `text-[13px]` (45), plus off-scale `text-[11.5px]` / `text-[10.5px]`; `text-micro/small/body` utilities have 0 uses. Tailwind default `text-xs`, `rounded-md`, `shadow-xl` are common.
- **Hard-coded colors** — 26 six-digit hex in component TSX, mostly `work-items/shared/wi-visuals.tsx` (state dots) and `flyout/FlyoutGlance.tsx` (off-palette gradients); avatar gradients, window-close red, and find highlights are literals in CSS.
- **Theme logic duplicated** in `FlyoutApp`, `PRDetailApp`, `SqlApp`, `WorkItemDetailApp`, and `useWorkItemPaletteSearch` instead of `useTheme`.
- **No enforcement** — no lint rule for hex or arbitrary values; the contrast test uses hand-copied hex values.

### Token Hygiene
- **Unused tokens (~57)**: floating-badge set (`badge-glass`, `badge-surface`, `badge-border`, `badge-glow-*`), all `review-*`, `whats-new-*` fg/bg/border, `tracked-*` / `working-on-*`, `tab-active/inactive`, `pr-badge-*`, `pr-my-badge-*`, `branch-badge-*`, `target-badge-*`, `comment-count-fg`, several `action-*` and `check-*`, `avatar-text`, `expanded-row-bg`, `diff-hunk-header` (duplicate), `syntax-tag/attribute/plain`, `radius-md/xl`, `space-10/12`, `text-title`, `duration-breath`
- **Dead CSS**: `.sidebar-*` block (and its `sidebar-gradient-*` tokens), `.field-input`, and six unused keyframes (`toast-progress-shrink`, `notifPop`, `scale-in`, `comment-enter`, `fadeSlideIn`, `slideInRight`)
- **Aliases**: `bg-primary` duplicates `background`
- **Undefined references**: `--color-app-background` (PR detail fixture); `--flyout-shadow` defined inline in `FlyoutFrame.tsx`
- **Two body font stacks**: `body` doesn't use `--font-ui`
- **Two window-control families**: `.bd-wc` (36×28) and `.bd-window-control` (28×24)

### Missing
- No `prefers-reduced-motion` or `forced-colors` handling
- No line-height, font-weight, easing, or focus-ring tokens
- Spacing scale gaps (see §4.1)
- No `dark:` variant bound to `.dark`
- No primitive / token stories in Storybook
- Primitives still missing for Dialog, Menu, Tooltip, Skeleton, Toast (see §6.5)

---

## 11. Source of Truth

- Tokens, `@theme`, component classes: `src/BorgDock.Tauri/src/styles/index.css`
- Quick Review styles: `src/BorgDock.Tauri/src/components/focus/quick-review.css`
- Primitives: `src/BorgDock.Tauri/src/components/shared/primitives/`
- Theme hook: `src/BorgDock.Tauri/src/hooks/useTheme.ts`
- Contrast test: `src/BorgDock.Tauri/src/styles/__tests__/contrast.test.ts`
- Design specs & mockups: `docs/superpowers/specs/2026-04-24-shared-components-design.md`, `design/mockups/`, `design/quick-review/`
- Tray icons: rendered at runtime in `src-tauri/src/platform/tray.rs`; static icon assets in `src-tauri/icons/`
