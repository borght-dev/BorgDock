# BorgDock Design System

A structured reference for BorgDock's visual language, suitable for handing to a design tool (Claude Design, Figma plugins, token translators) or a human designer.

BorgDock is a dense, desktop-native developer tool. The visual language is tuned for dense information (many PRs, many checks, many rows) while still feeling warm and distinctive — it should never read as "bootstrap gray." The signature is **deep plum backgrounds with a violet accent** plus a muted aquamarine/ruby status palette.

---

## 1. Design Principles

1. **Dense but breathable.** Text is small (11–13px base), padding is tight (4–10px common), but whitespace is preserved between logical groups. Never hide information behind hover if it can fit.
2. **Violet is the only chromatic accent.** Everything interactive (buttons, tabs, selection, focus rings) uses the purple scale. Other hues are reserved for semantic meaning (status, diffs).
3. **Status is duochrome.** Success = aquamarine green, danger = ruby red, warning = amber, with a soft-tinted background (6–10% alpha) and a matching border (14–22% alpha). Never pure saturated fills.
4. **Surfaces, not shadows.** Depth is conveyed by `--color-surface-raised` / `--color-surface-hover` tints, not drop shadows. Shadows are reserved for floating UI (toasts, badge, modal).
5. **Dark theme is first-class.** Every color token has a `.dark` override. Do not hard-code hex values in components — always go through a token.
6. **Tactile micro-motion.** Buttons scale to 0.9–0.97 on press with 80ms transform + 120ms color transitions. Everything feels slightly pressable.

---

## 2. Color Tokens

All tokens live on `:root` (light) and `.dark` (dark) in `src/BorgDock.Tauri/src/styles/index.css`. 327 CSS custom properties in total — the catalog below groups them by semantic role.

### 2.1 Brand / Accent

| Token | Light | Dark | Role |
|---|---|---|---|
| `--color-accent` | `#6655d4` | `#7c6af6` | Primary interactive color (buttons, tabs, focus) |
| `--color-accent-foreground` | `#ffffff` | `#ffffff` | Text/icon on accent fills |
| `--color-accent-subtle` | `rgba(124,106,246,0.10)` | `rgba(124,106,246,0.15)` | Hover / selection wash |
| `--color-purple` | `#6655d4` | `#9384f7` | Purple scale anchor |
| `--color-purple-soft` | `rgba(124,106,246,0.06)` | `rgba(147,132,247,0.08)` | Tinted surface |
| `--color-purple-border` | `rgba(124,106,246,0.14)` | `rgba(147,132,247,0.20)` | Tinted border |

### 2.2 Surfaces & Background

| Token | Light | Dark | Role |
|---|---|---|---|
| `--color-background` | `#f7f5fb` | `#110f1a` | Window background |
| `--color-surface` | `#ffffff` | `#1a1726` | Raised panels, cards |
| `--color-surface-raised` | `rgba(90,86,112,0.03)` | `rgba(138,133,160,0.03)` | Subtle lift above surface |
| `--color-surface-hover` | `rgba(90,86,112,0.05)` | `rgba(138,133,160,0.05)` | Row hover |
| `--color-sidebar-gradient-top` | `#f7f5fb` | `#110f1a` | Sidebar vertical gradient start |
| `--color-sidebar-gradient-bottom` | `#edeaf4` | `#1a1726` | Sidebar vertical gradient end |
| `--color-card-background` | `#ffffff` | `#1a1726` | PR card fill |
| `--color-card-border` | `rgba(90,86,112,0.08)` | `rgba(138,133,160,0.08)` | PR card edge |
| `--color-card-border-my-pr` | `rgba(124,106,246,0.22)` | `rgba(124,106,246,0.22)` | Own-PR accent edge |

### 2.3 Text Hierarchy

Six-step scale (primary → ghost). Use one step down per level of emphasis.

| Token | Light | Dark |
|---|---|---|
| `--color-text-primary` | `#1a1726` | `#edeaf4` |
| `--color-text-secondary` | `#3a3550` | `#c8c4d6` |
| `--color-text-tertiary` | `#5a5670` | `#8a85a0` |
| `--color-text-muted` | `#8a85a0` | `#5a5670` |
| `--color-text-faint` | `#b8b0c8` | `#3a3650` |
| `--color-text-ghost` | `#d8d4e3` | `#2a2640` |

### 2.4 Borders & Separators

| Token | Light | Dark |
|---|---|---|
| `--color-subtle-border` | `rgba(90,86,112,0.08)` | `rgba(138,133,160,0.08)` |
| `--color-strong-border` | `rgba(90,86,112,0.14)` | `rgba(138,133,160,0.14)` |
| `--color-separator` | `rgba(90,86,112,0.08)` | `rgba(138,133,160,0.08)` |

### 2.5 Status (semantic)

| Token | Light | Dark |
|---|---|---|
| `--color-status-green` | `#3ba68e` | `#7dd3c0` |
| `--color-status-red` | `#c7324f` | `#e54065` |
| `--color-status-yellow` | `#b07d09` | `#f5b73b` |
| `--color-status-gray` | `#8a85a0` | `#5a5670` |

Each status has matching **badge** and **glow** tokens:
- Badge bg (6–10% alpha), fg (same as status), border (14–22% alpha) — e.g. `--color-success-badge-{bg,fg,border}`, and mirrored for `warning`, `error`, `neutral`, `draft`.
- Glow: `--color-{green,red}-glow`, `--color-badge-glow-{green,red,yellow}`, `--color-toast-{success,error,warning,info,merged}-glow`.

### 2.6 Review States

| Token | Light | Dark | Maps to |
|---|---|---|---|
| `--color-review-approved` | `#3ba68e` | `#7dd3c0` | status-green |
| `--color-review-changes-requested` | `#c7324f` | `#e54065` | status-red |
| `--color-review-required` | `#b07d09` | `#f5b73b` | status-yellow |
| `--color-review-commented` | `#5a5670` | `#8a85a0` | text-tertiary |

### 2.7 Interactive / Button Roles

| Token | Light | Dark | Used on |
|---|---|---|---|
| `--color-action-secondary-bg` | transparent | transparent | Ghost button bg |
| `--color-action-secondary-fg` | `#6655d4` | `#9384f7` | Ghost button text |
| `--color-action-success-bg` | `rgba(59,166,142,0.07)` | `rgba(125,211,192,0.10)` | Confirm action tint |
| `--color-action-success-fg` | `#3ba68e` | `#7dd3c0` | Confirm action text |
| `--color-action-danger-bg` | `rgba(199,50,79,0.06)` | `rgba(229,64,101,0.10)` | Destructive tint |
| `--color-action-danger-fg` | `#c7324f` | `#e54065` | Destructive text |
| `--color-icon-btn-bg` | transparent | transparent | Icon button base |
| `--color-icon-btn-hover` | `rgba(90,86,112,0.06)` | `rgba(138,133,160,0.08)` | Icon button hover |
| `--color-icon-btn-pressed` | `rgba(90,86,112,0.10)` | `rgba(138,133,160,0.12)` | Icon button press |
| `--color-icon-btn-fg` | `#5a5670` | `#8a85a0` | Icon button stroke |

### 2.8 Input / Form Controls

| Token | Light | Dark |
|---|---|---|
| `--color-input-bg` | `#ffffff` | `rgba(138,133,160,0.04)` |
| `--color-input-border` | `rgba(90,86,112,0.12)` | `rgba(138,133,160,0.10)` |
| `--color-selected-row-bg` | `rgba(124,106,246,0.06)` | `rgba(124,106,246,0.06)` |
| `--color-expanded-row-bg` | `rgba(90,86,112,0.02)` | `rgba(138,133,160,0.02)` |

### 2.9 Overlays, Modals, Title Bar

| Token | Light | Dark |
|---|---|---|
| `--color-overlay-bg` | `rgba(0,0,0,0.35)` | `rgba(0,0,0,0.65)` |
| `--color-modal-bg` | `#ffffff` | `#1a1726` |
| `--color-modal-border` | `rgba(90,86,112,0.10)` | `rgba(138,133,160,0.10)` |
| `--color-title-bar-bg` | `rgba(247,245,251,0.88)` | `rgba(26,23,38,0.80)` |
| `--color-status-bar-bg` | `rgba(247,245,251,0.88)` | `rgba(17,15,26,0.60)` |

### 2.10 Floating Badge

A distinctive feature — five selectable styles share this palette:

| Token | Light | Dark |
|---|---|---|
| `--color-badge-glass` | `rgba(247,245,251,0.97)` | `rgba(26,23,38,0.97)` |
| `--color-badge-surface` | `rgba(237,234,244,0.97)` | `rgba(26,23,38,0.97)` |
| `--color-badge-border` | `rgba(90,86,112,0.12)` | `rgba(255,255,255,0.12)` |
| `--color-badge-glow-green/red/yellow` | see 2.5 | see 2.5 |
| `--color-badge-progress-track` | `rgba(90,86,112,0.07)` | `rgba(255,255,255,0.06)` |

### 2.11 Diff View

Full token set for unified diff rendering:
- `--color-diff-added-{bg,bg-highlight,gutter-bg}` (green scale)
- `--color-diff-deleted-{bg,bg-highlight,gutter-bg}` (red scale)
- `--color-diff-context-bg`, `--color-diff-hunk-header-{bg,text}`, `--color-diff-line-number`
- `--color-diff-file-header-{bg,border}`, `--color-diff-border`
- `--color-code-block-bg` (standalone code blocks)

### 2.12 Syntax Highlighting (Tree-sitter)

14-token syntax palette covering the supported grammars:

| Token | Role | Light | Dark |
|---|---|---|---|
| `--color-syntax-keyword` | `if`, `for`, `fn`… | `#6655d4` | `#b8b0f8` |
| `--color-syntax-string` | string literals | `#3ba68e` | `#7dd3c0` |
| `--color-syntax-comment` | comments | `#8a85a0` | `#5a5670` |
| `--color-syntax-number` | numeric literals | `#b07d09` | `#f5b73b` |
| `--color-syntax-type` | types, classes | `#c7324f` | `#e54065` |
| `--color-syntax-function` | function names | `#3a3550` | `#c8c4d6` |
| `--color-syntax-variable` | identifiers | `#1a1726` | `#edeaf4` |
| `--color-syntax-operator` | `+`, `=`, `->` | `#5a5670` | `#8a85a0` |
| `--color-syntax-punctuation` | `;`, `,`, `.` | `#8a85a0` | `#5a5670` |
| `--color-syntax-constant` | `true`, `null`, consts | `#6655d4` | `#b8b0f8` |
| `--color-syntax-property` | object properties | `#3a3550` | `#c8c4d6` |
| `--color-syntax-tag` | HTML/JSX tags | `#c7324f` | `#e54065` |
| `--color-syntax-attribute` | HTML attrs, decorators | `#b07d09` | `#f5b73b` |
| `--color-syntax-plain` | fallback | `#1a1726` | `#edeaf4` |

### 2.13 Notification Toast

Per-severity triple (`glow`, `stripe`, `icon-bg`):
- `--color-toast-{success,error,warning,info,merged}-{glow,stripe,icon-bg}`
- Plus `--color-toast-bg` and the animated `--color-toast-merged-shimmer` gradient.

### 2.14 What's New

- `--color-whats-new-{new,improved,fixed}-{fg,bg,border}` — three kinds aligned with status-green / status-yellow / purple scales.
- `--color-whats-new-rail` — accordion rail color.

### 2.15 Scrollbar, Wizard, Splash, Logo

Small token groups — each is self-contained in the CSS (search `--color-scrollbar-`, `--color-wizard-`, `--color-splash-`, `--color-logo-`).

---

## 3. Typography

System fonts only. No webfont loading.

### 3.1 Font Families

| Token | Value | Used for |
|---|---|---|
| UI | `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` | All UI chrome |
| `--font-code` | `"Cascadia Code", "Cascadia Mono", "Consolas", "Courier New", monospace` | Code, SQL input, diff, file viewer |

### 3.2 Font Sizes (observed clusters)

BorgDock uses a compact type scale. Promote these to formal tokens:

| Suggested token | Size | Usage |
|---|---|---|
| `--text-micro` | `10px` | Per-file stats, badge counters, very dense meta |
| `--text-small` | `11px` | Default UI (toolbars, chips, selects, run button) |
| `--text-body` | `12px` | Card body, descriptions, tab labels |
| `--text-base` | `13px` | Expanded PR content, headings in cards |
| `--text-title` | `18px` | Window titles, large page headings |

### 3.3 Font Weights

- 400 — body copy
- 500 — labels, select values
- 600 — buttons, badge text, emphasized metadata
- 700 — page/window titles (rare)

### 3.4 Line Height

- Default: browser default for density
- Code views: `1.5` (set via `--code-line-height` CSS var on `.CodeView`)

---

## 4. Spacing

No dedicated tokens exist yet. Observed scale (promote these):

| Suggested token | Value | Usage |
|---|---|---|
| `--space-1` | `2px` | Icon-group gap, status dot offset |
| `--space-2` | `4px` | Button vertical padding, chip padding-y |
| `--space-3` | `6px` | Icon-to-label gap |
| `--space-4` | `8px` | Toolbar gap, card inner gap |
| `--space-5` | `10px` | Button horizontal padding |
| `--space-6` | `12px` | Run-button horizontal padding, card padding |
| `--space-8` | `16px` | Section padding |
| `--space-12` | `24px` | Panel padding, modal padding |

---

## 5. Radii

| Suggested token | Value | Usage |
|---|---|---|
| `--radius-sm` | `5px` | Selects, buttons, chips |
| `--radius-md` | `6px` | Window control buttons, inputs |
| `--radius-lg` | `8px` | Cards, panels |
| `--radius-pill` | `9999px` | Status pills, PR number badges |

---

## 6. Motion

Transitions are short and paired. Promote these:

| Suggested token | Value | Usage |
|---|---|---|
| `--motion-press` | `transform 80ms ease` | Button press scale |
| `--motion-color` | `120ms ease` | bg / color transitions on buttons |
| `--motion-ui` | `150ms ease` | Generic UI transitions (border-color, opacity) |
| `--motion-tab` | `200ms ease-out` | Tab underline slide |
| `--motion-breath` | `3000ms` | Badge pulse / settle after state change |

Press scale values in use: `0.90` (icon button), `0.92` (window control), `0.97` (run button). Keep ≤0.97 for content buttons so the UI doesn't feel wobbly.

Focus rings: `outline: 2px solid var(--color-accent); outline-offset: 1px;` (or `-2px` on chrome buttons).

---

## 7. Elevation / Shadows

BorgDock uses glow more than shadow. Define these token slots:

| Suggested token | Purpose |
|---|---|
| `--elevation-0` | Flat surface — no shadow |
| `--elevation-1` | Card hover — `0 1px 2px rgba(0,0,0,0.04)` |
| `--elevation-2` | Floating badge — `0 8px 32px rgba(0,0,0,0.18)` with colored glow |
| `--elevation-3` | Modal / overlay — `0 20px 60px rgba(0,0,0,0.32)` |
| `--glow-status-*` | see §2.5 glow tokens — colored drop shadow for floating badge |

---

## 8. Component Inventory

Existing building blocks in `src/BorgDock.Tauri/src/components/`. Entries marked **(ad-hoc)** are currently styled per-feature and should be extracted into a shared primitive.

### Primitives

| Component | Status | Notes |
|---|---|---|
| Button (primary / secondary / ghost / success / danger) | **ad-hoc** | Sized variants needed (toolbar 11px / body 12px / large 13px). Shared press-scale + focus ring. |
| IconButton | ✓ `.tactile-icon-btn` | 80ms press, accent focus ring |
| WindowControls | ✓ `.window-ctrl-btn`, `.window-ctrl-btn--close` | Close variant uses Windows red `#e81123` hover |
| Input | **ad-hoc** | Uses input-bg + input-border; 150ms border-color on focus |
| Select | **ad-hoc** | `.sql-connection-select` is a reference |
| Checkbox / Radio | **ad-hoc** | No primitive |
| Badge (status / PR number / draft / branch / target / whats-new) | **ad-hoc** | Standardize on `{bg,fg,border}` triple per variant |
| Chip (filter) | **ad-hoc** | `--color-filter-chip-{bg,fg}` |
| Tab | **ad-hoc** | `--color-tab-{active,inactive}`, 200ms underline slide |
| Card (PR card, detail card) | **ad-hoc** | Own-PR accent via `--color-card-border-my-pr` |
| Dialog / Modal | **ad-hoc** | Uses overlay + modal tokens |
| Dropdown / Menu | **ad-hoc** | Context menus on PR cards, tray menu |
| Tooltip / InlineHint | ✓ `InlineHint.tsx` | Onboarding hint pattern |
| FeatureBadge | ✓ `FeatureBadge.tsx` | Onboarding "new" dot |

### Composed / Feature

| Component | Location |
|---|---|
| PR Card | `components/pr/` |
| PR Detail Panel (tabbed) | `components/pr-detail/` |
| Focus List + Priority Reason Label | `components/focus/` |
| Quick Review Overlay + Card + Summary | `components/focus/` |
| File Palette (results, preview, roots, search) | `components/file-palette/` |
| File Viewer window | `components/file-viewer/` |
| CodeView | `components/file-palette/CodeView.tsx` |
| Diff view | `components/diff/` |
| Worktree Palette / Prune Dialog | `components/worktree/` |
| Command Palette | `components/command-palette/` |
| SQL App (toolbar, editor, results table) | `components/sql/` |
| Settings Flyout | `components/settings/` |
| Setup Wizard | `components/wizard/` |
| Notification Toast | `components/notifications/` |
| Floating Badge (5 styles) | `components/badge/` |
| What's New (Hero, Release, Highlight, Fixed list) | `components/whats-new/` |

---

## 9. Patterns

### 9.1 How to pick a color

1. Ask: is this state (success / warning / error) or brand (accent / purple)? Use status tokens for the former, accent/purple for the latter.
2. For a fill: use the `-bg` variant (6–10% alpha tint).
3. For text on top of that fill: use the `-fg` variant (same hue, full saturation).
4. For a border: use the `-border` variant (14–22% alpha).
5. Never hardcode a hex — if there's no token that fits, add one.

### 9.2 Pressable element

```css
.my-btn {
  transition: background 120ms ease, color 120ms ease, transform 80ms ease;
}
.my-btn:hover:not(:disabled) { opacity: 0.88; }
.my-btn:active:not(:disabled) { transform: scale(0.97); }
.my-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
```

### 9.3 Status-tinted badge

```css
.my-badge--success {
  background: var(--color-success-badge-bg);
  color: var(--color-success-badge-fg);
  border: 1px solid var(--color-success-badge-border);
  border-radius: var(--radius-pill);
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
}
```

### 9.4 Floating surface with glow

```css
.my-float {
  background: var(--color-badge-glass);
  border: 1px solid var(--color-badge-border);
  box-shadow: 0 8px 32px var(--color-badge-glow-green);
  backdrop-filter: blur(12px);
}
```

---

## 10. Tailwind v4 Integration (Recommendation)

Tailwind is imported via `@import "tailwindcss"` but no `@theme` directive exists, so the 327 color tokens aren't exposed as utilities (`bg-status-green`, `text-accent`, etc.). Recommended addition to `index.css`:

```css
@theme {
  --color-*: initial; /* opt out of Tailwind's default palette */

  /* Re-export every semantic token so Tailwind generates utilities */
  --color-accent: var(--color-accent);
  --color-surface: var(--color-surface);
  --color-text-primary: var(--color-text-primary);
  /* …etc for every token you want as a utility… */

  /* Promote the spacing / radius / text scales */
  --spacing-1: 2px;
  --spacing-2: 4px;
  /* …etc… */
  --radius-sm: 5px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-pill: 9999px;

  --text-micro: 10px;
  --text-small: 11px;
  --text-body: 12px;
  --text-base: 13px;
  --text-title: 18px;

  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-mono: "Cascadia Code", "Cascadia Mono", "Consolas", "Courier New", monospace;
}
```

After this, components can drop most `style={{}}` props in favor of `className="bg-surface text-primary border-subtle"`.

---

## 11. Tokens — Machine-Readable Export

A starter [DTCG](https://tr.designtokens.org/format/) JSON for designer tooling (subset shown; extend to cover the full catalog in §2):

```json
{
  "color": {
    "accent":           { "$value": "#6655d4", "$type": "color", "$extensions": { "dark": "#7c6af6" } },
    "accent-foreground":{ "$value": "#ffffff", "$type": "color", "$extensions": { "dark": "#ffffff" } },

    "bg":               { "$value": "#f7f5fb", "$type": "color", "$extensions": { "dark": "#110f1a" } },
    "surface":          { "$value": "#ffffff", "$type": "color", "$extensions": { "dark": "#1a1726" } },
    "surface-raised":   { "$value": "rgba(90,86,112,0.03)", "$type": "color", "$extensions": { "dark": "rgba(138,133,160,0.03)" } },

    "text-primary":     { "$value": "#1a1726", "$type": "color", "$extensions": { "dark": "#edeaf4" } },
    "text-secondary":   { "$value": "#3a3550", "$type": "color", "$extensions": { "dark": "#c8c4d6" } },
    "text-tertiary":    { "$value": "#5a5670", "$type": "color", "$extensions": { "dark": "#8a85a0" } },
    "text-muted":       { "$value": "#8a85a0", "$type": "color", "$extensions": { "dark": "#5a5670" } },

    "status-green":     { "$value": "#3ba68e", "$type": "color", "$extensions": { "dark": "#7dd3c0" } },
    "status-red":       { "$value": "#c7324f", "$type": "color", "$extensions": { "dark": "#e54065" } },
    "status-yellow":    { "$value": "#b07d09", "$type": "color", "$extensions": { "dark": "#f5b73b" } },

    "border-subtle":    { "$value": "rgba(90,86,112,0.08)", "$type": "color", "$extensions": { "dark": "rgba(138,133,160,0.08)" } },
    "border-strong":    { "$value": "rgba(90,86,112,0.14)", "$type": "color", "$extensions": { "dark": "rgba(138,133,160,0.14)" } }
  },
  "size": {
    "space-1":  { "$value": "2px",  "$type": "dimension" },
    "space-2":  { "$value": "4px",  "$type": "dimension" },
    "space-4":  { "$value": "8px",  "$type": "dimension" },
    "space-6":  { "$value": "12px", "$type": "dimension" },
    "space-8":  { "$value": "16px", "$type": "dimension" },

    "radius-sm":   { "$value": "5px",    "$type": "dimension" },
    "radius-md":   { "$value": "6px",    "$type": "dimension" },
    "radius-lg":   { "$value": "8px",    "$type": "dimension" },
    "radius-pill": { "$value": "9999px", "$type": "dimension" },

    "text-micro": { "$value": "10px", "$type": "dimension" },
    "text-small": { "$value": "11px", "$type": "dimension" },
    "text-body":  { "$value": "12px", "$type": "dimension" },
    "text-base":  { "$value": "13px", "$type": "dimension" },
    "text-title": { "$value": "18px", "$type": "dimension" }
  },
  "duration": {
    "motion-press": { "$value": "80ms",  "$type": "duration" },
    "motion-color": { "$value": "120ms", "$type": "duration" },
    "motion-ui":    { "$value": "150ms", "$type": "duration" },
    "motion-tab":   { "$value": "200ms", "$type": "duration" }
  }
}
```

---

## 12. Current Gaps (to close if taking this system to a tool)

- **No spacing / radius / typography / shadow tokens** as CSS variables — §4–§7 above are recommended additions.
- **No `@theme` block** — Tailwind utilities aren't semantic yet (§10).
- **No primitive components** for Button, Input, Select, Dialog, Menu — each feature re-rolls its own variant.
- **Per-feature CSS files** (`sql-*`, `.file-palette-*`, `.window-ctrl-*`) coexist with Tailwind — pick one primary styling approach and migrate (recommendation: keep feature CSS for dense feature-specific layout, move primitives to Tailwind + `@theme`).
- **No dark-mode contrast audit** recorded. Tokens look good but should be verified against WCAG AA for text on tinted backgrounds.

---

## 13. Source of Truth

- Color, syntax, and most existing tokens: `src/BorgDock.Tauri/src/styles/index.css`
- Feature-specific CSS: `src/BorgDock.Tauri/src/styles/file-palette.css`, `worktree-palette.css`, `file-viewer.css`
- Theme switching: `src/BorgDock.Tauri/src/` — theme applied by toggling `.dark` class on `<html>`, driven by the theme store (system / light / dark)
- Tray icon variants: `src/BorgDock.Tauri/src-tauri/icons/` (light and dark tray variants)
