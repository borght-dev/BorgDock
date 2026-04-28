# Streamline PR #1 — Foundation: Tokens + Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote every semantic token into a Tailwind `@theme` block, and land the 13 shared primitives (Button, IconButton, Pill, Chip, Dot, Avatar, Ring, LinearProgress, Tabs, Kbd, Input, Card, Titlebar) with unit test coverage — unused by any consumer.

**Architecture:** `src/styles/index.css` keeps its existing `:root` / `.dark` token declarations (329 lines) verbatim, gains a set of new custom properties (`--space-*`, `--radius-*`, `--text-*`, `--duration-*`, `--font-ui`), and grows a `@theme inline` block that re-exports every semantic color, spacing, radius, type, font, and duration token as a Tailwind theme variable so utilities like `bg-surface`, `text-primary`, `border-subtle-border`, `rounded-lg`, `p-5`, `text-body`, `duration-color` all generate. Primitive visual shapes ship as `@layer components` classes ported from the design prototype's `tokens.css` (the `bd-*` namespace), so they're pixel-identical to the design canvas that PR #0's visual regression suite compares against. Primitives themselves live under `src/components/shared/primitives/` with one file per primitive, named exports only, and a barrel `index.ts`. Each primitive is covered by a Vitest + Testing Library spec under `src/components/shared/primitives/__tests__/`. No existing consumer imports the primitives in this PR — that migration happens in PR #2 onward.

**Tech Stack:** Tailwind v4.1 (`@theme inline` directive), React 19, TypeScript 5.8, Vitest 3.1, `@testing-library/react` 16.3, `@testing-library/jest-dom` 6.6, `clsx` 2.1.

**Target worktree:** `~/projects/borgdock-streamline-01` (already created in the handoff — branch is `feat/streamline-01-foundation`, stacked on `feat/streamline-00-regression-baseline`).

**Target branch:** `feat/streamline-01-foundation` (off `feat/streamline-00-regression-baseline`, NOT `master`).

**Spec reference:** `docs/superpowers/specs/2026-04-24-shared-components-design.md` — this plan implements §4.1 (token `@theme` block), §5 (primitive catalog), and the PR #1 row of §8.

---

## Background the executor must know before starting

1. **`@theme inline` vs `@theme`.** Tailwind v4's `@theme { --color-foo: #abc }` bakes the literal value into generated utilities — `bg-foo` resolves to `background-color: #abc` at build time, and runtime overrides of `--color-foo` under `.dark` stop working. The fix is `@theme inline` — theme variables declared inside this block are emitted as `var(--color-foo)` in utilities, so the existing `:root { --color-foo: #light }` / `.dark { --color-foo: #dark }` overrides continue to drive both generated utilities and hand-written CSS. This PR uses `@theme inline` exclusively.

2. **Zero-out Tailwind's default palette.** Without `--color-*: initial;` inside `@theme inline`, Tailwind ships its default color palette (`bg-red-500`, `text-blue-200`, etc.) alongside the BorgDock tokens. That's noise and bloat. The plan sets `--color-*: initial;` so only BorgDock tokens generate utilities.

3. **The prototype's `bd-*` CSS classes.** `tests/e2e/design-bundle/borgdock/project/styles/tokens.css` (committed in PR #0) contains ~400 lines of `bd-pill`, `bd-btn`, `bd-icon-btn`, `bd-dot`, `bd-avatar`, `bd-ring`, `bd-linear`, `bd-tabs`, `bd-tab`, `bd-tab__count`, `bd-kbd`, `bd-input`, `bd-card`, `bd-titlebar`, `bd-statusbar`, `bd-section-label`, `bd-window`, `bd-wc` shape CSS. The primitives in this PR render markup that consumes those class names; the CSS is ported verbatim into `@layer components` in `src/styles/index.css` so the app is visually identical to the prototype. This keeps the PR #0 visual baselines truthful: when PR #2 swaps the first consumer to `<Pill tone="success">`, the rendered output matches the design PNG.

4. **No consumer changes.** Nothing outside `src/styles/index.css` and `src/components/shared/primitives/` is modified by this PR. In particular, `WindowTitleBar.tsx` stays unchanged — it's rewritten on top of the new `Titlebar` in PR #2.

5. **Coverage threshold.** `vitest` runs with a 90% coverage threshold (statements/branches/functions/lines). Each primitive's test file must exercise every branch (every tone, every size, every optional prop). Use `expect.element(...).toHaveClass(...)` / `toHaveAttribute(...)` / `toBeInTheDocument()` from `@testing-library/jest-dom`.

6. **No default exports.** All primitive files export named symbols only (`export function Button(...)`). The barrel re-exports with named exports (`export { Button } from './Button';`). TSDoc lives above every exported symbol.

7. **`clsx` for class composition.** Already in `dependencies` (v2.1). Use `clsx('bd-pill', `bd-pill--${tone}`, className)` — not template literals. This keeps conditional classes readable and trims falsy values automatically.

8. **The worktree already exists.** `~/projects/borgdock-streamline-01` was created before this plan was written, branched off `feat/streamline-00-regression-baseline`, with branch `feat/streamline-01-foundation`. Do NOT re-create it. All `cd` commands in this plan assume `~/projects/borgdock-streamline-01` unless noted.

---

## Task 1: Sanity-check the worktree state

**Files:**
- No files modified; verification only.

- [ ] **Step 1: Confirm branch**

Run: `cd ~/projects/borgdock-streamline-01 && git rev-parse --abbrev-ref HEAD`
Expected: `feat/streamline-01-foundation`.

- [ ] **Step 2: Confirm it's stacked on PR #0**

Run: `cd ~/projects/borgdock-streamline-01 && git merge-base HEAD origin/feat/streamline-00-regression-baseline`
Expected: a SHA that matches `git rev-parse origin/feat/streamline-00-regression-baseline` (i.e. the branch is at or ahead of PR #0's tip, not diverged from master).

- [ ] **Step 3: Confirm the design bundle is present**

Run: `ls ~/projects/borgdock-streamline-01/src/BorgDock.Tauri/tests/e2e/design-bundle/borgdock/project/styles/tokens.css`
Expected: the file exists. This is the CSS we'll port from in Task 5.

- [ ] **Step 4: Confirm primitives directory does NOT exist yet**

Run: `ls ~/projects/borgdock-streamline-01/src/BorgDock.Tauri/src/components/shared/primitives/ 2>&1`
Expected: `No such file or directory`. If it exists, the worktree is stale — fail loudly.

- [ ] **Step 5: Install dependencies once** (needed for `npm test` in later tasks)

Run: `cd ~/projects/borgdock-streamline-01/src/BorgDock.Tauri && npm install`
Expected: completes without error. Skips if `node_modules/` already present from the outer worktree.

- [ ] **Step 6: No commit** — nothing changed.

---

## Task 2: Extend `:root` and `.dark` with the new token families

**Files:**
- Modify: `src/BorgDock.Tauri/src/styles/index.css` — add `--space-*`, `--radius-*`, `--text-*`, `--duration-*`, `--font-ui` custom properties inside the existing `:root` block. Add dark-theme overrides for the few that differ under `.dark` (just `--elevation-*`).

- [ ] **Step 1: Read the current `:root` block** (familiarise with the existing order)

Run: `cd ~/projects/borgdock-streamline-01 && sed -n '1,260p' src/BorgDock.Tauri/src/styles/index.css | head -20`

The file starts with `@import "tailwindcss";` then `:root { /* Background — deep purple */ --color-background: #f7f5fb; ... }`.

- [ ] **Step 2: Append the new token families inside `:root`**

Insert these declarations at the end of the `:root` block — immediately before its closing `}` on line 259 (the line that closes `:root` containing `--color-whats-new-rail`). Do NOT touch any existing token.

```css
  /* ── Spacing scale (new — backing for @theme inline) ── */
  --space-1: 2px;
  --space-2: 4px;
  --space-3: 6px;
  --space-4: 8px;
  --space-5: 10px;
  --space-6: 12px;
  --space-8: 16px;
  --space-10: 20px;
  --space-12: 24px;

  /* ── Radii (new) ── */
  --radius-sm: 5px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-pill: 9999px;

  /* ── Type scale (new) ── */
  --text-micro: 10px;
  --text-small: 11px;
  --text-body: 12px;
  --text-base: 13px;
  --text-title: 18px;

  /* ── Motion durations (new) ── */
  --duration-press: 80ms;
  --duration-color: 120ms;
  --duration-ui: 150ms;
  --duration-tab: 200ms;
  --duration-breath: 2600ms;

  /* ── UI font family (new — paired with existing --font-code) ── */
  --font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui,
    "Helvetica Neue", Arial, sans-serif;

  /* ── Elevation (new) ── */
  --elevation-1: 0 1px 2px rgba(0, 0, 0, 0.04);
  --elevation-2: 0 8px 32px rgba(26, 23, 38, 0.14);
  --elevation-3: 0 20px 60px rgba(26, 23, 38, 0.28);

  /* ── Status-merged (new — prototype uses this for merged PR pills) ── */
  --color-status-merged: #8250df;
```

- [ ] **Step 3: Append the dark overrides for elevation + status-merged inside `.dark`**

Insert at the end of the `.dark` block — immediately before its closing `}`. Find it by searching for the `--color-whats-new-rail: rgba(124, 106, 246, 0.24);` line inside `.dark` (around line 474). Insert before the `}` that follows.

```css
  /* Elevations darken on dark theme */
  --elevation-1: 0 1px 2px rgba(0, 0, 0, 0.2);
  --elevation-2: 0 8px 32px rgba(0, 0, 0, 0.4);
  --elevation-3: 0 20px 60px rgba(0, 0, 0, 0.6);

  --color-status-merged: #a371f7;
```

- [ ] **Step 4: Verify the file still parses**

Run: `cd ~/projects/borgdock-streamline-01/src/BorgDock.Tauri && npx vite build 2>&1 | tail -20`
Expected: `✓ built in …`. If Tailwind or PostCSS complains, fix syntax before continuing.

- [ ] **Step 5: Commit**

```bash
cd ~/projects/borgdock-streamline-01
git add src/BorgDock.Tauri/src/styles/index.css
git commit -m "feat(tokens): add space/radius/text/duration/elevation/font-ui custom properties"
```

---

## Task 3: Add the `@theme inline` block

**Files:**
- Modify: `src/BorgDock.Tauri/src/styles/index.css` — insert `@theme inline { … }` immediately after the `@import "tailwindcss";` line, before `:root`.

- [ ] **Step 1: Insert the `@theme inline` block**

After `@import "tailwindcss";` (line 1) and before the `/*` comment that precedes `:root`, insert the block below. It's long on purpose — every semantic token the app uses gets a Tailwind utility.

```css
/*
 * @theme inline — promote every runtime CSS custom property into a Tailwind
 * theme variable so utilities generate against BorgDock tokens (e.g. `bg-surface`,
 * `text-primary`, `border-subtle-border`, `rounded-lg`, `p-5`, `text-body`).
 * `inline` keeps the emitted utility CSS as `var(--…)` references rather than
 * baking the literal value at build time, so `.dark` overrides keep working.
 */
@theme inline {
  /* Reset Tailwind's default color palette so only BorgDock tokens surface */
  --color-*: initial;

  /* Brand / accent */
  --color-accent: var(--color-accent);
  --color-accent-foreground: var(--color-accent-foreground);
  --color-accent-subtle: var(--color-accent-subtle);
  --color-purple: var(--color-purple);
  --color-purple-soft: var(--color-purple-soft);
  --color-purple-border: var(--color-purple-border);

  /* Surfaces */
  --color-background: var(--color-background);
  --color-surface: var(--color-surface);
  --color-surface-raised: var(--color-surface-raised);
  --color-surface-hover: var(--color-surface-hover);
  --color-sidebar-gradient-top: var(--color-sidebar-gradient-top);
  --color-sidebar-gradient-bottom: var(--color-sidebar-gradient-bottom);
  --color-card-background: var(--color-card-background);
  --color-card-border: var(--color-card-border);
  --color-card-border-my-pr: var(--color-card-border-my-pr);

  /* Text hierarchy */
  --color-text-primary: var(--color-text-primary);
  --color-text-secondary: var(--color-text-secondary);
  --color-text-tertiary: var(--color-text-tertiary);
  --color-text-muted: var(--color-text-muted);
  --color-text-faint: var(--color-text-faint);
  --color-text-ghost: var(--color-text-ghost);

  /* Borders + separators */
  --color-subtle-border: var(--color-subtle-border);
  --color-strong-border: var(--color-strong-border);
  --color-separator: var(--color-separator);

  /* Status */
  --color-status-green: var(--color-status-green);
  --color-status-red: var(--color-status-red);
  --color-status-yellow: var(--color-status-yellow);
  --color-status-gray: var(--color-status-gray);
  --color-status-merged: var(--color-status-merged);

  /* Filter chip + tracking */
  --color-filter-chip-bg: var(--color-filter-chip-bg);
  --color-filter-chip-fg: var(--color-filter-chip-fg);
  --color-tracked-border: var(--color-tracked-border);
  --color-tracked-soft: var(--color-tracked-soft);
  --color-working-on-border: var(--color-working-on-border);
  --color-working-on-soft: var(--color-working-on-soft);

  /* Icon button */
  --color-icon-btn-bg: var(--color-icon-btn-bg);
  --color-icon-btn-hover: var(--color-icon-btn-hover);
  --color-icon-btn-pressed: var(--color-icon-btn-pressed);
  --color-icon-btn-fg: var(--color-icon-btn-fg);

  /* Action buttons */
  --color-action-secondary-bg: var(--color-action-secondary-bg);
  --color-action-secondary-fg: var(--color-action-secondary-fg);
  --color-action-success-bg: var(--color-action-success-bg);
  --color-action-success-fg: var(--color-action-success-fg);
  --color-action-danger-bg: var(--color-action-danger-bg);
  --color-action-danger-fg: var(--color-action-danger-fg);

  /* Scrollbar */
  --color-scrollbar-thumb: var(--color-scrollbar-thumb);
  --color-scrollbar-thumb-hover: var(--color-scrollbar-thumb-hover);

  /* PR number badge */
  --color-pr-badge-bg: var(--color-pr-badge-bg);
  --color-pr-badge-fg: var(--color-pr-badge-fg);
  --color-pr-my-badge-bg: var(--color-pr-my-badge-bg);
  --color-pr-my-badge-fg: var(--color-pr-my-badge-fg);

  /* Tone badges */
  --color-success-badge-bg: var(--color-success-badge-bg);
  --color-success-badge-fg: var(--color-success-badge-fg);
  --color-success-badge-border: var(--color-success-badge-border);
  --color-warning-badge-bg: var(--color-warning-badge-bg);
  --color-warning-badge-fg: var(--color-warning-badge-fg);
  --color-warning-badge-border: var(--color-warning-badge-border);
  --color-error-badge-bg: var(--color-error-badge-bg);
  --color-error-badge-fg: var(--color-error-badge-fg);
  --color-error-badge-border: var(--color-error-badge-border);
  --color-neutral-badge-bg: var(--color-neutral-badge-bg);
  --color-neutral-badge-fg: var(--color-neutral-badge-fg);
  --color-neutral-badge-border: var(--color-neutral-badge-border);
  --color-draft-badge-bg: var(--color-draft-badge-bg);
  --color-draft-badge-fg: var(--color-draft-badge-fg);
  --color-draft-badge-border: var(--color-draft-badge-border);

  /* Review states */
  --color-review-approved: var(--color-review-approved);
  --color-review-changes-requested: var(--color-review-changes-requested);
  --color-review-required: var(--color-review-required);
  --color-review-commented: var(--color-review-commented);
  --color-comment-count-fg: var(--color-comment-count-fg);

  /* Branch badges */
  --color-branch-badge-bg: var(--color-branch-badge-bg);
  --color-branch-badge-border: var(--color-branch-badge-border);
  --color-target-badge-bg: var(--color-target-badge-bg);
  --color-target-badge-border: var(--color-target-badge-border);

  /* Input */
  --color-input-bg: var(--color-input-bg);
  --color-input-border: var(--color-input-border);

  /* Row states */
  --color-selected-row-bg: var(--color-selected-row-bg);
  --color-expanded-row-bg: var(--color-expanded-row-bg);

  /* Chrome */
  --color-status-bar-bg: var(--color-status-bar-bg);
  --color-title-bar-bg: var(--color-title-bar-bg);

  /* Overlay / modal */
  --color-overlay-bg: var(--color-overlay-bg);
  --color-modal-bg: var(--color-modal-bg);
  --color-modal-border: var(--color-modal-border);

  /* Logo gradient */
  --color-logo-gradient-start: var(--color-logo-gradient-start);
  --color-logo-gradient-end: var(--color-logo-gradient-end);

  /* Avatar */
  --color-avatar-text: var(--color-avatar-text);

  /* Checks */
  --color-check-passed-bg: var(--color-check-passed-bg);
  --color-check-passed-border: var(--color-check-passed-border);
  --color-check-failed-bg: var(--color-check-failed-bg);
  --color-check-failed-border: var(--color-check-failed-border);

  /* Glow */
  --color-green-glow: var(--color-green-glow);
  --color-red-glow: var(--color-red-glow);

  /* Floating badge */
  --color-badge-glass: var(--color-badge-glass);
  --color-badge-surface: var(--color-badge-surface);
  --color-badge-border: var(--color-badge-border);
  --color-badge-glow-green: var(--color-badge-glow-green);
  --color-badge-glow-red: var(--color-badge-glow-red);
  --color-badge-glow-yellow: var(--color-badge-glow-yellow);
  --color-badge-progress-track: var(--color-badge-progress-track);

  /* Diff */
  --color-diff-added-bg: var(--color-diff-added-bg);
  --color-diff-added-bg-highlight: var(--color-diff-added-bg-highlight);
  --color-diff-added-gutter-bg: var(--color-diff-added-gutter-bg);
  --color-diff-deleted-bg: var(--color-diff-deleted-bg);
  --color-diff-deleted-bg-highlight: var(--color-diff-deleted-bg-highlight);
  --color-diff-deleted-gutter-bg: var(--color-diff-deleted-gutter-bg);
  --color-diff-context-bg: var(--color-diff-context-bg);
  --color-diff-hunk-header-bg: var(--color-diff-hunk-header-bg);
  --color-diff-hunk-header-text: var(--color-diff-hunk-header-text);
  --color-diff-line-number: var(--color-diff-line-number);
  --color-diff-file-header-bg: var(--color-diff-file-header-bg);
  --color-diff-file-header-border: var(--color-diff-file-header-border);
  --color-diff-border: var(--color-diff-border);
  --color-diff-hunk-header: var(--color-diff-hunk-header);
  --color-tab-active: var(--color-tab-active);
  --color-tab-inactive: var(--color-tab-inactive);
  --color-code-block-bg: var(--color-code-block-bg);

  /* Syntax */
  --color-syntax-keyword: var(--color-syntax-keyword);
  --color-syntax-string: var(--color-syntax-string);
  --color-syntax-comment: var(--color-syntax-comment);
  --color-syntax-number: var(--color-syntax-number);
  --color-syntax-type: var(--color-syntax-type);
  --color-syntax-function: var(--color-syntax-function);
  --color-syntax-variable: var(--color-syntax-variable);
  --color-syntax-operator: var(--color-syntax-operator);
  --color-syntax-punctuation: var(--color-syntax-punctuation);
  --color-syntax-constant: var(--color-syntax-constant);
  --color-syntax-property: var(--color-syntax-property);
  --color-syntax-tag: var(--color-syntax-tag);
  --color-syntax-attribute: var(--color-syntax-attribute);
  --color-syntax-plain: var(--color-syntax-plain);

  /* Wizard */
  --color-wizard-step-active: var(--color-wizard-step-active);
  --color-wizard-step-complete: var(--color-wizard-step-complete);
  --color-wizard-step-inactive: var(--color-wizard-step-inactive);
  --color-wizard-step-track: var(--color-wizard-step-track);

  /* Splash */
  --color-splash-gradient-end: var(--color-splash-gradient-end);

  /* Toast */
  --color-toast-bg: var(--color-toast-bg);
  --color-toast-success-glow: var(--color-toast-success-glow);
  --color-toast-error-glow: var(--color-toast-error-glow);
  --color-toast-warning-glow: var(--color-toast-warning-glow);
  --color-toast-info-glow: var(--color-toast-info-glow);
  --color-toast-success-stripe: var(--color-toast-success-stripe);
  --color-toast-error-stripe: var(--color-toast-error-stripe);
  --color-toast-warning-stripe: var(--color-toast-warning-stripe);
  --color-toast-info-stripe: var(--color-toast-info-stripe);
  --color-toast-success-icon-bg: var(--color-toast-success-icon-bg);
  --color-toast-error-icon-bg: var(--color-toast-error-icon-bg);
  --color-toast-warning-icon-bg: var(--color-toast-warning-icon-bg);
  --color-toast-info-icon-bg: var(--color-toast-info-icon-bg);
  --color-toast-merged-glow: var(--color-toast-merged-glow);
  --color-toast-merged-stripe: var(--color-toast-merged-stripe);
  --color-toast-merged-icon-bg: var(--color-toast-merged-icon-bg);
  --color-toast-merged-icon-fg: var(--color-toast-merged-icon-fg);

  /* What's new */
  --color-whats-new-new-fg: var(--color-whats-new-new-fg);
  --color-whats-new-new-bg: var(--color-whats-new-new-bg);
  --color-whats-new-new-border: var(--color-whats-new-new-border);
  --color-whats-new-improved-fg: var(--color-whats-new-improved-fg);
  --color-whats-new-improved-bg: var(--color-whats-new-improved-bg);
  --color-whats-new-improved-border: var(--color-whats-new-improved-border);
  --color-whats-new-fixed-fg: var(--color-whats-new-fixed-fg);
  --color-whats-new-fixed-bg: var(--color-whats-new-fixed-bg);
  --color-whats-new-fixed-border: var(--color-whats-new-fixed-border);
  --color-whats-new-rail: var(--color-whats-new-rail);

  /* Spacing — generates p-1..12, m-1..12, gap-1..12, etc. */
  --spacing-1: var(--space-1);
  --spacing-2: var(--space-2);
  --spacing-3: var(--space-3);
  --spacing-4: var(--space-4);
  --spacing-5: var(--space-5);
  --spacing-6: var(--space-6);
  --spacing-8: var(--space-8);
  --spacing-10: var(--space-10);
  --spacing-12: var(--space-12);

  /* Radii — generates rounded-sm, rounded-md, rounded-lg, rounded-xl, rounded-pill */
  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
  --radius-xl: var(--radius-xl);
  --radius-pill: var(--radius-pill);

  /* Type scale — generates text-micro, text-small, text-body, text-base, text-title */
  --text-micro: var(--text-micro);
  --text-small: var(--text-small);
  --text-body: var(--text-body);
  --text-base: var(--text-base);
  --text-title: var(--text-title);

  /* Motion — generates duration-press, duration-color, duration-ui, duration-tab, duration-breath */
  --duration-press: var(--duration-press);
  --duration-color: var(--duration-color);
  --duration-ui: var(--duration-ui);
  --duration-tab: var(--duration-tab);
  --duration-breath: var(--duration-breath);

  /* Fonts — generates font-sans, font-mono */
  --font-sans: var(--font-ui);
  --font-mono: var(--font-code);
}
```

- [ ] **Step 2: Verify the build still succeeds**

Run: `cd ~/projects/borgdock-streamline-01/src/BorgDock.Tauri && npx vite build 2>&1 | tail -20`
Expected: `✓ built in …`. A Tailwind warning about unknown tokens means a typo; fix before continuing.

- [ ] **Step 3: Spot-check a generated utility**

Run: `cd ~/projects/borgdock-streamline-01/src/BorgDock.Tauri && grep -o "bg-surface[^ ]*\|bg-accent[^,]*\|rounded-lg" dist/assets/*.css | head -5`
Expected: at least one hit for `bg-surface` or `bg-accent` — proof that utilities generated against the theme variables. If zero hits, the `@theme inline` block isn't being parsed; re-check syntax.

- [ ] **Step 4: Commit**

```bash
cd ~/projects/borgdock-streamline-01
git add src/BorgDock.Tauri/src/styles/index.css
git commit -m "feat(tokens): promote every semantic token into @theme inline"
```

---

## Task 4: Add the `@layer components` block with the `bd-*` primitive shapes

**Files:**
- Modify: `src/BorgDock.Tauri/src/styles/index.css` — append `@layer components { … }` at the end of the file, after the existing `@keyframes slideInRight` block.

**Why `@layer components` not a separate stylesheet:** spec §4.2. These shapes live in the main stylesheet under `@layer components` so they can be overridden by utility classes (utilities win over components in Tailwind v4's layer ordering), and so they're loaded by every entrypoint (main, flyout, palette, etc.) without per-surface imports.

- [ ] **Step 1: Append the component layer at the end of `index.css`**

```css
/* ════════════════════════════════════════════════════════
   Primitive component shapes (bd-* namespace)
   Ported verbatim from the design canvas (tests/e2e/design-bundle/borgdock/project/styles/tokens.css).
   Consumed by src/components/shared/primitives/. Keep this block in sync
   with the prototype — the visual regression suite compares against those
   PNGs. If you need to tweak a value, tweak both.
   ════════════════════════════════════════════════════════ */
@layer components {
  /* ── Pill ────────────────────────────────────────── */
  .bd-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 20px;
    padding: 0 8px;
    border-radius: var(--radius-pill);
    font-size: var(--text-small);
    font-weight: 600;
    border: 1px solid transparent;
    white-space: nowrap;
    transition:
      background var(--duration-color) ease,
      color var(--duration-color) ease,
      border-color var(--duration-color) ease;
  }
  .bd-pill--success {
    background: var(--color-success-badge-bg);
    color: var(--color-success-badge-fg);
    border-color: var(--color-success-badge-border);
  }
  .bd-pill--warning {
    background: var(--color-warning-badge-bg);
    color: var(--color-warning-badge-fg);
    border-color: var(--color-warning-badge-border);
  }
  .bd-pill--error {
    background: var(--color-error-badge-bg);
    color: var(--color-error-badge-fg);
    border-color: var(--color-error-badge-border);
  }
  .bd-pill--neutral {
    background: var(--color-neutral-badge-bg);
    color: var(--color-neutral-badge-fg);
    border-color: var(--color-neutral-badge-border);
  }
  .bd-pill--draft {
    background: var(--color-draft-badge-bg);
    color: var(--color-draft-badge-fg);
    border-color: var(--color-draft-badge-border);
  }
  .bd-pill--ghost {
    background: transparent;
    color: var(--color-text-tertiary);
    border-color: var(--color-subtle-border);
    font-weight: 500;
  }

  /* ── Dot ─────────────────────────────────────────── */
  .bd-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .bd-dot--green {
    background: var(--color-status-green);
  }
  .bd-dot--red {
    background: var(--color-status-red);
  }
  .bd-dot--yellow {
    background: var(--color-status-yellow);
  }
  .bd-dot--gray {
    background: var(--color-status-gray);
  }
  .bd-dot--merged {
    background: var(--color-status-merged);
  }

  @keyframes bd-pulse-dot {
    0%,
    100% {
      box-shadow: 0 0 0 0 currentColor;
      opacity: 1;
    }
    50% {
      box-shadow: 0 0 0 4px transparent;
      opacity: 0.7;
    }
  }

  /* ── Button ──────────────────────────────────────── */
  .bd-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    height: 28px;
    padding: 0 var(--space-5);
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: var(--text-body);
    font-weight: 500;
    color: var(--color-text-secondary);
    background: transparent;
    border: 1px solid var(--color-subtle-border);
    cursor: pointer;
    transition:
      background var(--duration-color) ease,
      color var(--duration-color) ease,
      transform var(--duration-press) ease,
      border-color var(--duration-color) ease;
    white-space: nowrap;
  }
  .bd-btn:hover:not(:disabled) {
    background: var(--color-surface-hover);
    border-color: var(--color-strong-border);
  }
  .bd-btn:active:not(:disabled) {
    transform: scale(0.97);
  }
  .bd-btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
  .bd-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .bd-btn--primary {
    background: var(--color-accent);
    color: var(--color-accent-foreground);
    border-color: transparent;
  }
  .bd-btn--primary:hover:not(:disabled) {
    background: var(--color-accent);
    opacity: 0.88;
  }
  .bd-btn--ghost {
    border-color: transparent;
    color: var(--color-text-tertiary);
  }
  .bd-btn--ghost:hover:not(:disabled) {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
  }
  .bd-btn--danger {
    color: var(--color-status-red);
    border-color: var(--color-error-badge-border);
    border-style: dashed;
  }
  .bd-btn--danger:hover:not(:disabled) {
    background: var(--color-error-badge-bg);
  }
  .bd-btn--sm {
    height: 24px;
    padding: 0 var(--space-4);
    font-size: var(--text-small);
  }
  .bd-btn--lg {
    height: 32px;
    padding: 0 var(--space-6);
    font-size: var(--text-base);
  }
  .bd-btn__spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1.5px solid currentColor;
    border-top-color: transparent;
    animation: bd-btn-spin 0.7s linear infinite;
  }
  @keyframes bd-btn-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ── IconButton ──────────────────────────────────── */
  .bd-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-text-tertiary);
    cursor: pointer;
    transition:
      background var(--duration-color) ease,
      color var(--duration-color) ease,
      transform var(--duration-press) ease;
  }
  .bd-icon-btn:hover:not(:disabled) {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
  }
  .bd-icon-btn:active:not(:disabled) {
    transform: scale(0.9);
  }
  .bd-icon-btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
  .bd-icon-btn--active {
    background: var(--color-accent-subtle);
    color: var(--color-accent);
  }
  .bd-icon-btn--sm {
    width: 22px;
    height: 22px;
  }
  .bd-icon-btn--lg {
    width: 30px;
    height: 30px;
  }

  /* ── Input ───────────────────────────────────────── */
  .bd-input {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: 28px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-sm);
    background: var(--color-input-bg);
    border: 1px solid var(--color-input-border);
    font-size: var(--text-body);
    color: var(--color-text-primary);
    font-family: inherit;
    transition: border-color var(--duration-ui) ease;
    width: 100%;
  }
  .bd-input:focus-within {
    border-color: var(--color-accent);
    outline: none;
  }
  .bd-input input {
    border: 0;
    background: transparent;
    outline: 0;
    flex: 1;
    font: inherit;
    color: inherit;
    min-width: 0;
  }
  .bd-input input::placeholder {
    color: var(--color-text-muted);
  }
  .bd-input__adornment {
    display: inline-flex;
    align-items: center;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  /* ── Tabs ────────────────────────────────────────── */
  .bd-tabs {
    display: flex;
    align-items: stretch;
    gap: var(--space-5);
    border-bottom: 1px solid var(--color-subtle-border);
    position: relative;
  }
  .bd-tabs--dense {
    gap: var(--space-4);
  }
  .bd-tab {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-1);
    font-size: var(--text-body);
    color: var(--color-text-tertiary);
    background: transparent;
    border: 0;
    cursor: pointer;
    font-family: inherit;
    position: relative;
    transition: color var(--duration-color) ease;
    font-weight: 500;
  }
  .bd-tab:hover {
    color: var(--color-text-primary);
  }
  .bd-tab--active {
    color: var(--color-accent);
  }
  .bd-tab--active::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 2px;
    background: var(--color-accent);
    border-radius: 2px 2px 0 0;
    transition: all var(--duration-tab) ease-out;
  }
  .bd-tab__count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 16px;
    padding: 0 5px;
    border-radius: var(--radius-pill);
    background: var(--color-accent-subtle);
    color: var(--color-accent);
    font-size: var(--text-micro);
    font-weight: 600;
  }
  .bd-tab--inactive .bd-tab__count {
    background: var(--color-surface-hover);
    color: var(--color-text-tertiary);
  }

  /* ── Avatar ──────────────────────────────────────── */
  .bd-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    font-size: var(--text-micro);
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #fff;
    flex-shrink: 0;
  }
  .bd-avatar--own {
    background: linear-gradient(135deg, #3ba68e, #2d8b75);
  }
  .bd-avatar--them {
    background: linear-gradient(135deg, #6655d4, #4f3fb3);
  }
  .bd-avatar--blue {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
  }
  .bd-avatar--rose {
    background: linear-gradient(135deg, #e54065, #c7324f);
  }
  .bd-avatar--sm {
    width: 20px;
    height: 20px;
    font-size: 9px;
  }
  .bd-avatar--lg {
    width: 28px;
    height: 28px;
    font-size: var(--text-small);
  }

  /* ── Ring (readiness) ───────────────────────────── */
  .bd-ring {
    --ring-size: 28px;
    width: var(--ring-size);
    height: var(--ring-size);
    position: relative;
    flex-shrink: 0;
  }
  .bd-ring svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  .bd-ring__track {
    stroke: var(--color-surface-hover);
  }
  .bd-ring__value {
    stroke-linecap: round;
    transition: stroke-dashoffset 600ms ease;
  }
  .bd-ring__label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-small);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  /* ── LinearProgress ──────────────────────────────── */
  .bd-linear {
    height: 4px;
    border-radius: var(--radius-pill);
    background: var(--color-surface-hover);
    overflow: hidden;
    position: relative;
    width: 100%;
  }
  .bd-linear__fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: var(--radius-pill);
    transition: width 400ms ease;
  }
  .bd-linear__fill--accent {
    background: var(--color-accent);
  }
  .bd-linear__fill--success {
    background: var(--color-status-green);
  }
  .bd-linear__fill--warning {
    background: var(--color-status-yellow);
  }
  .bd-linear__fill--error {
    background: var(--color-status-red);
  }

  /* ── Kbd ─────────────────────────────────────────── */
  .bd-kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--color-surface-hover);
    border: 1px solid var(--color-subtle-border);
    font-family: var(--font-code);
    font-size: var(--text-micro);
    color: var(--color-text-tertiary);
    min-height: 18px;
  }

  /* ── Card ────────────────────────────────────────── */
  .bd-card {
    background: var(--color-card-background);
    border: 1px solid var(--color-card-border);
    border-radius: var(--radius-lg);
    transition:
      border-color var(--duration-ui) ease,
      box-shadow var(--duration-ui) ease,
      transform var(--duration-ui) ease;
  }
  .bd-card--own {
    border-left: 2px solid var(--color-card-border-my-pr);
  }
  .bd-card--pad-sm {
    padding: var(--space-4);
  }
  .bd-card--pad-md {
    padding: var(--space-5);
  }
  .bd-card--pad-lg {
    padding: var(--space-8);
  }
  .bd-card--interactive {
    cursor: pointer;
  }
  .bd-card--interactive:hover {
    border-color: var(--color-strong-border);
    box-shadow: var(--elevation-1);
  }

  /* ── Titlebar ────────────────────────────────────── */
  .bd-titlebar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    height: 36px;
    padding: 0 var(--space-3) 0 var(--space-4);
    background: var(--color-title-bar-bg);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--color-subtle-border);
    user-select: none;
  }
  .bd-titlebar__title {
    font-size: var(--text-body);
    font-weight: 600;
    color: var(--color-text-primary);
    letter-spacing: -0.005em;
  }
  .bd-titlebar__count {
    font-size: var(--text-small);
    color: var(--color-text-tertiary);
    font-weight: 500;
  }
  .bd-titlebar__spacer {
    flex: 1;
  }
  .bd-titlebar__meta {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--color-text-tertiary);
    font-size: var(--text-small);
  }
}
```

- [ ] **Step 2: Verify the build still succeeds**

Run: `cd ~/projects/borgdock-streamline-01/src/BorgDock.Tauri && npx vite build 2>&1 | tail -5`
Expected: `✓ built in …`.

- [ ] **Step 3: Commit**

```bash
cd ~/projects/borgdock-streamline-01
git add src/BorgDock.Tauri/src/styles/index.css
git commit -m "feat(styles): port bd-* primitive shapes into @layer components"
```

---

## Task 5: Create the primitives directory + empty barrel

**Files:**
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/index.ts` — empty barrel (exports added as each primitive lands).
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/__tests__/.gitkeep` — ensures the tests directory exists.

- [ ] **Step 1: Create the barrel**

Write `src/BorgDock.Tauri/src/components/shared/primitives/index.ts`:

```ts
// Primitive components — shared visual vocabulary used by every surface.
// Keep this barrel append-only and alphabetical. Named exports only.
```

- [ ] **Step 2: Create the tests folder placeholder**

Write `src/BorgDock.Tauri/src/components/shared/primitives/__tests__/.gitkeep` as an empty file.

- [ ] **Step 3: Commit**

```bash
cd ~/projects/borgdock-streamline-01
git add src/BorgDock.Tauri/src/components/shared/primitives/
git commit -m "chore(primitives): scaffold directory + empty barrel"
```

---

## Task 6: `Pill` primitive

**Files:**
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/Pill.tsx`
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Pill.test.tsx`
- Modify: `src/BorgDock.Tauri/src/components/shared/primitives/index.ts` — append `export { Pill } from './Pill';`.

- [ ] **Step 1: Write the failing test**

Write `src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Pill.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Pill } from '../Pill';

describe('Pill', () => {
  it('renders children inside a bd-pill root', () => {
    render(<Pill tone="neutral">Open</Pill>);
    const el = screen.getByText('Open');
    expect(el).toHaveClass('bd-pill');
  });

  it.each([
    ['success', 'bd-pill--success'],
    ['warning', 'bd-pill--warning'],
    ['error', 'bd-pill--error'],
    ['neutral', 'bd-pill--neutral'],
    ['draft', 'bd-pill--draft'],
    ['ghost', 'bd-pill--ghost'],
  ] as const)('applies the correct tone class for %s', (tone, expected) => {
    render(<Pill tone={tone}>x</Pill>);
    expect(screen.getByText('x')).toHaveClass(expected);
  });

  it('renders the leading icon when provided', () => {
    render(
      <Pill tone="success" icon={<span data-testid="icon" />}>
        Merged
      </Pill>,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('forwards className alongside tone classes', () => {
    render(
      <Pill tone="neutral" className="extra">
        x
      </Pill>,
    );
    expect(screen.getByText('x')).toHaveClass('extra');
    expect(screen.getByText('x')).toHaveClass('bd-pill--neutral');
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `cd ~/projects/borgdock-streamline-01/src/BorgDock.Tauri && npm test -- Pill`
Expected: FAIL with `Failed to resolve import "../Pill"`.

- [ ] **Step 3: Implement**

Write `src/BorgDock.Tauri/src/components/shared/primitives/Pill.tsx`:

```tsx
import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export type PillTone = 'success' | 'warning' | 'error' | 'neutral' | 'draft' | 'ghost';

export interface PillProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Semantic tone — drives the background/foreground/border triple. */
  tone: PillTone;
  /** Optional leading icon rendered before the children. */
  icon?: ReactNode;
  /** Pill label. */
  children: ReactNode;
}

/**
 * Pill — compact status badge.
 * Replaces every ad-hoc `.badge`, `.status-chip`, `.branch-badge`, `.draft-indicator`
 * across the app once PR #3+ migrates consumers.
 */
export function Pill({ tone, icon, children, className, ...rest }: PillProps) {
  return (
    <span className={clsx('bd-pill', `bd-pill--${tone}`, className)} {...rest}>
      {icon}
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `cd ~/projects/borgdock-streamline-01/src/BorgDock.Tauri && npm test -- Pill`
Expected: 9 tests pass (`renders children` + 6 tones + icon + className).

- [ ] **Step 5: Add to barrel**

Edit `src/BorgDock.Tauri/src/components/shared/primitives/index.ts` — append:

```ts
export { Pill } from './Pill';
export type { PillProps, PillTone } from './Pill';
```

- [ ] **Step 6: Commit**

```bash
cd ~/projects/borgdock-streamline-01
git add src/BorgDock.Tauri/src/components/shared/primitives/Pill.tsx src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Pill.test.tsx src/BorgDock.Tauri/src/components/shared/primitives/index.ts
git commit -m "feat(primitives): add Pill"
```

---

## Task 7: `Dot` primitive

**Files:**
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/Dot.tsx`
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Dot.test.tsx`
- Modify: `src/BorgDock.Tauri/src/components/shared/primitives/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Dot } from '../Dot';

describe('Dot', () => {
  it('renders a bd-dot span', () => {
    render(<Dot tone="green" data-testid="d" />);
    const el = screen.getByTestId('d');
    expect(el.tagName).toBe('SPAN');
    expect(el).toHaveClass('bd-dot');
  });

  it.each([
    ['green', 'bd-dot--green'],
    ['red', 'bd-dot--red'],
    ['yellow', 'bd-dot--yellow'],
    ['gray', 'bd-dot--gray'],
    ['merged', 'bd-dot--merged'],
  ] as const)('applies %s tone class', (tone, expected) => {
    render(<Dot tone={tone} data-testid="d" />);
    expect(screen.getByTestId('d')).toHaveClass(expected);
  });

  it('defaults to an 8px square', () => {
    render(<Dot tone="gray" data-testid="d" />);
    const style = screen.getByTestId('d').style;
    expect(style.width).toBe('8px');
    expect(style.height).toBe('8px');
  });

  it('respects a custom size', () => {
    render(<Dot tone="gray" size={12} data-testid="d" />);
    const style = screen.getByTestId('d').style;
    expect(style.width).toBe('12px');
    expect(style.height).toBe('12px');
  });

  it('animates when pulse is true', () => {
    render(<Dot tone="green" pulse data-testid="d" />);
    expect(screen.getByTestId('d').style.animation).toContain('bd-pulse-dot');
  });

  it('does not animate when pulse is false', () => {
    render(<Dot tone="green" data-testid="d" />);
    expect(screen.getByTestId('d').style.animation).toBe('');
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm test -- Dot` from `src/BorgDock.Tauri`.
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export type DotTone = 'green' | 'red' | 'yellow' | 'gray' | 'merged';

export interface DotProps extends HTMLAttributes<HTMLSpanElement> {
  /** Status tone — drives the fill colour via tokens. */
  tone: DotTone;
  /** Animate a soft pulse ring. Default false. */
  pulse?: boolean;
  /** Square pixel size. Default 8. */
  size?: number;
}

/**
 * Dot — tiny status indicator.
 * Replaces ad-hoc status dots across sidebar header, tray indicators, floating badge.
 */
export function Dot({ tone, pulse = false, size = 8, className, style, ...rest }: DotProps) {
  return (
    <span
      className={clsx('bd-dot', `bd-dot--${tone}`, className)}
      style={{
        width: size,
        height: size,
        animation: pulse ? 'bd-pulse-dot 2.6s ease-in-out infinite' : undefined,
        ...style,
      }}
      {...rest}
    />
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- Dot`. Expected: all tests pass.

- [ ] **Step 5: Update barrel**

Append to `index.ts`:

```ts
export { Dot } from './Dot';
export type { DotProps, DotTone } from './Dot';
```

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/primitives/Dot.tsx src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Dot.test.tsx src/BorgDock.Tauri/src/components/shared/primitives/index.ts
git commit -m "feat(primitives): add Dot"
```

---

## Task 8: `Avatar` primitive

**Files:**
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/Avatar.tsx`
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Avatar.test.tsx`
- Modify: `index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar } from '../Avatar';

describe('Avatar', () => {
  it('renders initials inside a bd-avatar span', () => {
    render(<Avatar initials="KV" />);
    const el = screen.getByText('KV');
    expect(el).toHaveClass('bd-avatar');
  });

  it.each([
    ['own', 'bd-avatar--own'],
    ['them', 'bd-avatar--them'],
    ['blue', 'bd-avatar--blue'],
    ['rose', 'bd-avatar--rose'],
  ] as const)('applies %s tone class', (tone, expected) => {
    render(<Avatar initials="X" tone={tone} />);
    expect(screen.getByText('X')).toHaveClass(expected);
  });

  it('defaults tone to "them" when no tone is passed', () => {
    render(<Avatar initials="Y" />);
    expect(screen.getByText('Y')).toHaveClass('bd-avatar--them');
  });

  it.each([
    ['sm', 'bd-avatar--sm'],
    ['lg', 'bd-avatar--lg'],
  ] as const)('applies %s size class', (size, expected) => {
    render(<Avatar initials="A" size={size} />);
    expect(screen.getByText('A')).toHaveClass(expected);
  });

  it('has no size class when size is md', () => {
    render(<Avatar initials="M" size="md" />);
    const cls = screen.getByText('M').className;
    expect(cls).not.toContain('bd-avatar--sm');
    expect(cls).not.toContain('bd-avatar--lg');
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm test -- Avatar`.
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export type AvatarTone = 'own' | 'them' | 'blue' | 'rose';
export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Two-letter initials shown in the centre. */
  initials: string;
  /** Gradient preset. Default 'them'. */
  tone?: AvatarTone;
  /** Size preset. Default 'md'. */
  size?: AvatarSize;
}

/**
 * Avatar — gradient-filled initial bubble.
 * Replaces gradient avatar patterns in PR/Focus/Reviews/WorkItems.
 */
export function Avatar({
  initials,
  tone = 'them',
  size = 'md',
  className,
  ...rest
}: AvatarProps) {
  return (
    <span
      className={clsx(
        'bd-avatar',
        `bd-avatar--${tone}`,
        size === 'sm' && 'bd-avatar--sm',
        size === 'lg' && 'bd-avatar--lg',
        className,
      )}
      {...rest}
    >
      {initials}
    </span>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- Avatar`.

- [ ] **Step 5: Update barrel**

```ts
export { Avatar } from './Avatar';
export type { AvatarProps, AvatarSize, AvatarTone } from './Avatar';
```

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/primitives/Avatar.tsx src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Avatar.test.tsx src/BorgDock.Tauri/src/components/shared/primitives/index.ts
git commit -m "feat(primitives): add Avatar"
```

---

## Task 9: `Kbd` primitive

**Files:**
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/Kbd.tsx`
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Kbd.test.tsx`
- Modify: `index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Kbd } from '../Kbd';

describe('Kbd', () => {
  it('renders children inside a <kbd class="bd-kbd">', () => {
    render(<Kbd>Ctrl</Kbd>);
    const el = screen.getByText('Ctrl');
    expect(el.tagName).toBe('KBD');
    expect(el).toHaveClass('bd-kbd');
  });

  it('forwards className', () => {
    render(<Kbd className="extra">Enter</Kbd>);
    expect(screen.getByText('Enter')).toHaveClass('extra');
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

- [ ] **Step 3: Implement**

```tsx
import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

/**
 * Kbd — keyboard key chip.
 * Used inside tooltips, command palette, onboarding surfaces.
 */
export function Kbd({ children, className, ...rest }: KbdProps) {
  return (
    <kbd className={clsx('bd-kbd', className)} {...rest}>
      {children}
    </kbd>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Update barrel**

```ts
export { Kbd } from './Kbd';
export type { KbdProps } from './Kbd';
```

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/primitives/Kbd.tsx src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Kbd.test.tsx src/BorgDock.Tauri/src/components/shared/primitives/index.ts
git commit -m "feat(primitives): add Kbd"
```

---

## Task 10: `Button` primitive

**Files:**
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/Button.tsx`
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Button.test.tsx`
- Modify: `index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../Button';

describe('Button', () => {
  it('renders a <button> with bd-btn root class', () => {
    render(<Button variant="primary" size="md">Click me</Button>);
    const el = screen.getByRole('button', { name: 'Click me' });
    expect(el).toHaveClass('bd-btn');
  });

  it.each([
    ['primary', 'bd-btn--primary'],
    ['danger', 'bd-btn--danger'],
    ['ghost', 'bd-btn--ghost'],
  ] as const)('applies %s variant class', (variant, expected) => {
    render(<Button variant={variant} size="md">x</Button>);
    expect(screen.getByRole('button')).toHaveClass(expected);
  });

  it('secondary variant adds no variant modifier class', () => {
    render(<Button variant="secondary" size="md">x</Button>);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('bd-btn');
    expect(cls).not.toContain('bd-btn--primary');
    expect(cls).not.toContain('bd-btn--danger');
    expect(cls).not.toContain('bd-btn--ghost');
  });

  it.each([
    ['sm', 'bd-btn--sm'],
    ['lg', 'bd-btn--lg'],
  ] as const)('applies %s size class', (size, expected) => {
    render(<Button variant="secondary" size={size}>x</Button>);
    expect(screen.getByRole('button')).toHaveClass(expected);
  });

  it('medium size adds no size modifier class', () => {
    render(<Button variant="secondary" size="md">x</Button>);
    const cls = screen.getByRole('button').className;
    expect(cls).not.toContain('bd-btn--sm');
    expect(cls).not.toContain('bd-btn--lg');
  });

  it('renders leading + trailing adornments', () => {
    render(
      <Button
        variant="secondary"
        size="md"
        leading={<span data-testid="lead" />}
        trailing={<span data-testid="trail" />}
      >
        x
      </Button>,
    );
    expect(screen.getByTestId('lead')).toBeInTheDocument();
    expect(screen.getByTestId('trail')).toBeInTheDocument();
  });

  it('replaces leading with a spinner when loading', () => {
    render(
      <Button
        variant="primary"
        size="md"
        loading
        leading={<span data-testid="lead" />}
      >
        Save
      </Button>,
    );
    expect(screen.queryByTestId('lead')).not.toBeInTheDocument();
    expect(screen.getByRole('button').querySelector('.bd-btn__spinner')).not.toBeNull();
  });

  it('is disabled when loading is true', () => {
    render(<Button variant="primary" size="md" loading>Save</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('fires onClick when clicked', () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" size="md" onClick={onClick}>
        Click
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" size="md" disabled onClick={onClick}>
        Click
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults type to "button"', () => {
    render(<Button variant="secondary" size="md">x</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('allows overriding type for form submits', () => {
    render(
      <Button variant="primary" size="md" type="submit">
        Save
      </Button>,
    );
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

- [ ] **Step 3: Implement**

```tsx
import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Visual variant — drives background + border + focus treatment. */
  variant: ButtonVariant;
  /** Height + horizontal padding + font size preset. */
  size: ButtonSize;
  /** Optional icon rendered before the label. Swapped for a spinner when `loading`. */
  leading?: ReactNode;
  /** Optional icon rendered after the label. */
  trailing?: ReactNode;
  /** When true the leading adornment becomes a spinner and the button is disabled. */
  loading?: boolean;
  /** Label. */
  children: ReactNode;
  /** Button type. Defaults to "button" so it never accidentally submits a parent form. */
  type?: 'button' | 'submit' | 'reset';
}

/**
 * Button — the one shared button used for every non-icon action.
 * Variants: primary (accent fill), secondary (subtle border), ghost (no border), danger (dashed red).
 * Sizes: sm (24h/11px), md (28h/12px), lg (32h/13px).
 */
export function Button({
  variant,
  size,
  leading,
  trailing,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      // biome-ignore lint/a11y/useButtonType: explicit default above
      type={type}
      className={clsx(
        'bd-btn',
        variant === 'primary' && 'bd-btn--primary',
        variant === 'ghost' && 'bd-btn--ghost',
        variant === 'danger' && 'bd-btn--danger',
        size === 'sm' && 'bd-btn--sm',
        size === 'lg' && 'bd-btn--lg',
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="bd-btn__spinner" aria-hidden /> : leading}
      {children}
      {trailing}
    </button>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Update barrel**

```ts
export { Button } from './Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button';
```

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/primitives/Button.tsx src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Button.test.tsx src/BorgDock.Tauri/src/components/shared/primitives/index.ts
git commit -m "feat(primitives): add Button"
```

---

## Task 11: `IconButton` primitive

**Files:**
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/IconButton.tsx`
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/__tests__/IconButton.test.tsx`
- Modify: `index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IconButton } from '../IconButton';

describe('IconButton', () => {
  it('renders the icon inside a <button class="bd-icon-btn">', () => {
    render(<IconButton icon={<span data-testid="icon" />} aria-label="Close" />);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('bd-icon-btn');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('applies the bd-icon-btn--active class when active', () => {
    render(<IconButton icon={<span />} active aria-label="Pin" />);
    expect(screen.getByRole('button')).toHaveClass('bd-icon-btn--active');
  });

  it('does NOT apply the active class by default', () => {
    render(<IconButton icon={<span />} aria-label="Pin" />);
    expect(screen.getByRole('button').className).not.toContain('bd-icon-btn--active');
  });

  it.each([
    [22, 'bd-icon-btn--sm'],
    [30, 'bd-icon-btn--lg'],
  ] as const)('applies size class for size %s', (size, expected) => {
    render(<IconButton icon={<span />} size={size} aria-label="x" />);
    expect(screen.getByRole('button')).toHaveClass(expected);
  });

  it('uses default 26 size when size prop is omitted', () => {
    render(<IconButton icon={<span />} aria-label="x" />);
    const cls = screen.getByRole('button').className;
    expect(cls).not.toContain('bd-icon-btn--sm');
    expect(cls).not.toContain('bd-icon-btn--lg');
  });

  it('surfaces the tooltip prop as the title attribute', () => {
    render(<IconButton icon={<span />} tooltip="Settings" aria-label="Settings" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Settings');
  });

  it('fires onClick', () => {
    const onClick = vi.fn();
    render(<IconButton icon={<span />} aria-label="x" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('defaults type to button', () => {
    render(<IconButton icon={<span />} aria-label="x" />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

- [ ] **Step 3: Implement**

```tsx
import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type IconButtonSize = 22 | 26 | 30;

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Icon node rendered centred. */
  icon: ReactNode;
  /** Highlighted on/active state — e.g. pinned sidebar button. */
  active?: boolean;
  /** Native tooltip text. Duplicates `aria-label` for mouse users. */
  tooltip?: string;
  /** Square size in pixels. 22 → sm, 26 → default, 30 → lg. */
  size?: IconButtonSize;
  /** Button type. Defaults to "button". */
  type?: 'button' | 'submit' | 'reset';
}

/**
 * IconButton — square button with a single icon child.
 * Replaces the ad-hoc `.tactile-icon-btn` / `.bd-icon-btn` usages across the app.
 */
export function IconButton({
  icon,
  active = false,
  tooltip,
  size = 26,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      // biome-ignore lint/a11y/useButtonType: explicit default above
      type={type}
      title={tooltip}
      className={clsx(
        'bd-icon-btn',
        active && 'bd-icon-btn--active',
        size === 22 && 'bd-icon-btn--sm',
        size === 30 && 'bd-icon-btn--lg',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Update barrel**

```ts
export { IconButton } from './IconButton';
export type { IconButtonProps, IconButtonSize } from './IconButton';
```

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/primitives/IconButton.tsx src/BorgDock.Tauri/src/components/shared/primitives/__tests__/IconButton.test.tsx src/BorgDock.Tauri/src/components/shared/primitives/index.ts
git commit -m "feat(primitives): add IconButton"
```

---

## Task 12: `Chip` primitive

**Files:**
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/Chip.tsx`
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Chip.test.tsx`
- Modify: `index.ts`

Chip is a filter-bar button built on the Pill visual. When `active`, it renders as a neutral-tone pill; when inactive, a ghost pill. `tone="error"` + `active` overrides to the error tone. The `count` badge sits on the trailing edge.

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Chip } from '../Chip';

describe('Chip', () => {
  it('renders a <button class="bd-pill">', () => {
    render(<Chip>All</Chip>);
    const el = screen.getByRole('button', { name: /all/i });
    expect(el).toHaveClass('bd-pill');
  });

  it('inactive chips get the ghost pill tone', () => {
    render(<Chip>All</Chip>);
    expect(screen.getByRole('button')).toHaveClass('bd-pill--ghost');
  });

  it('active chips get the neutral pill tone', () => {
    render(<Chip active>All</Chip>);
    expect(screen.getByRole('button')).toHaveClass('bd-pill--neutral');
  });

  it('active + tone=error maps to the error pill tone', () => {
    render(
      <Chip active tone="error">
        Failed
      </Chip>,
    );
    expect(screen.getByRole('button')).toHaveClass('bd-pill--error');
  });

  it('inactive + tone=error still renders ghost (tone only kicks in when active)', () => {
    render(<Chip tone="error">Failed</Chip>);
    expect(screen.getByRole('button')).toHaveClass('bd-pill--ghost');
  });

  it('renders the count when provided', () => {
    render(<Chip count={7}>Mine</Chip>);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('omits the count when undefined', () => {
    render(<Chip>All</Chip>);
    expect(screen.getByRole('button').querySelector('.bd-chip__count')).toBeNull();
  });

  it('shows count=0 (zero is a meaningful value)', () => {
    render(<Chip count={0}>Empty</Chip>);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('fires onClick', () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>All</Chip>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has aria-pressed reflecting active state', () => {
    render(<Chip active>All</Chip>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

- [ ] **Step 3: Implement**

The count styling sits inline on the span — it's tiny and surface-specific. Keeping the CSS in the component avoids a `bd-chip__count` rule that would never be overridden.

```tsx
import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ChipTone = 'neutral' | 'error';

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Whether the chip is selected. Default false. */
  active?: boolean;
  /** Trailing count badge. `undefined` hides it; `0` still shows. */
  count?: number;
  /** When `active`, swap the default neutral tone for `error`. */
  tone?: ChipTone;
  /** Chip label. */
  children: ReactNode;
}

/**
 * Chip — toggleable filter pill with an optional trailing count.
 * Used by every filter bar (PR list, Work Items, detail tab filters).
 */
export function Chip({
  active = false,
  count,
  tone = 'neutral',
  className,
  children,
  ...rest
}: ChipProps) {
  const activeToneClass =
    tone === 'error' ? 'bd-pill--error' : 'bd-pill--neutral';
  return (
    <button
      type="button"
      aria-pressed={active}
      className={clsx(
        'bd-pill',
        'bd-chip',
        active ? activeToneClass : 'bd-pill--ghost',
        className,
      )}
      {...rest}
    >
      {children}
      {count !== undefined && (
        <span
          className="bd-chip__count"
          style={{
            fontSize: 10,
            padding: '0 5px',
            borderRadius: 999,
            background: active ? 'rgba(0,0,0,0.08)' : 'var(--color-surface-hover)',
            color: 'inherit',
            fontWeight: 600,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Update barrel**

```ts
export { Chip } from './Chip';
export type { ChipProps, ChipTone } from './Chip';
```

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/primitives/Chip.tsx src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Chip.test.tsx src/BorgDock.Tauri/src/components/shared/primitives/index.ts
git commit -m "feat(primitives): add Chip"
```

---

## Task 13: `Ring` primitive

**Files:**
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/Ring.tsx`
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Ring.test.tsx`
- Modify: `index.ts`

Ring uses two concentric SVG circles: the track (faint) and the arc (tinted). Thresholds (per §5): ≥80 green, ≥50 yellow, else red.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Ring } from '../Ring';

describe('Ring', () => {
  it('renders a bd-ring wrapper with --ring-size custom property', () => {
    render(<Ring value={75} data-testid="ring" />);
    const el = screen.getByTestId('ring');
    expect(el).toHaveClass('bd-ring');
    expect(el.style.getPropertyValue('--ring-size')).toBe('28px');
  });

  it('honours a custom size', () => {
    render(<Ring value={50} size={40} data-testid="ring" />);
    expect(screen.getByTestId('ring').style.getPropertyValue('--ring-size')).toBe('40px');
  });

  it('clamps value to the 0..100 range for the dash offset', () => {
    const { rerender } = render(<Ring value={-10} data-testid="ring" />);
    const low = screen
      .getByTestId('ring')
      .querySelector<SVGCircleElement>('.bd-ring__value');
    expect(low).not.toBeNull();
    const offLow = Number(low!.getAttribute('stroke-dashoffset'));
    rerender(<Ring value={200} data-testid="ring" />);
    const high = screen
      .getByTestId('ring')
      .querySelector<SVGCircleElement>('.bd-ring__value');
    const offHigh = Number(high!.getAttribute('stroke-dashoffset'));
    // -10 clamps to 0 (full offset), 200 clamps to 100 (zero offset)
    expect(offLow).toBeGreaterThan(offHigh);
    expect(offHigh).toBeCloseTo(0, 5);
  });

  it('renders the label by default', () => {
    render(<Ring value={82} />);
    expect(screen.getByText('82')).toBeInTheDocument();
  });

  it('hides the label when label={false}', () => {
    render(<Ring value={82} label={false} data-testid="ring" />);
    expect(screen.getByTestId('ring').querySelector('.bd-ring__label')).toBeNull();
  });

  it.each([
    [95, 'var(--color-status-green)'],
    [80, 'var(--color-status-green)'],
    [79, 'var(--color-status-yellow)'],
    [50, 'var(--color-status-yellow)'],
    [49, 'var(--color-status-red)'],
    [0, 'var(--color-status-red)'],
  ] as const)('applies correct stroke colour for value=%s', (value, expected) => {
    render(<Ring value={value} data-testid="ring" />);
    const arc = screen
      .getByTestId('ring')
      .querySelector<SVGCircleElement>('.bd-ring__value');
    expect(arc!.getAttribute('stroke')).toBe(expected);
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

- [ ] **Step 3: Implement**

```tsx
import clsx from 'clsx';
import type { CSSProperties, HTMLAttributes } from 'react';

export interface RingProps extends HTMLAttributes<HTMLDivElement> {
  /** Progress value 0..100. Values outside are clamped. */
  value: number;
  /** Square pixel size. Default 28. */
  size?: number;
  /** Stroke width in pixels. Default 3. */
  stroke?: number;
  /** Render the numeric label in the centre. Default true. */
  label?: boolean;
}

function strokeColorFor(value: number): string {
  if (value >= 80) return 'var(--color-status-green)';
  if (value >= 50) return 'var(--color-status-yellow)';
  return 'var(--color-status-red)';
}

/**
 * Ring — circular readiness indicator.
 * Thresholds: ≥80 green, ≥50 yellow, else red.
 * Renders a track circle + animated arc + optional numeric label.
 */
export function Ring({
  value,
  size = 28,
  stroke = 3,
  label = true,
  className,
  style,
  ...rest
}: RingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped / 100);
  const color = strokeColorFor(clamped);

  return (
    <div
      className={clsx('bd-ring', className)}
      style={{ ['--ring-size' as string]: `${size}px`, ...style } as CSSProperties}
      {...rest}
    >
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="bd-ring__track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="bd-ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      {label && (
        <span className="bd-ring__label" style={{ color }}>
          {Math.round(clamped)}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Update barrel**

```ts
export { Ring } from './Ring';
export type { RingProps } from './Ring';
```

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/primitives/Ring.tsx src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Ring.test.tsx src/BorgDock.Tauri/src/components/shared/primitives/index.ts
git commit -m "feat(primitives): add Ring"
```

---

## Task 14: `LinearProgress` primitive

**Files:**
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/LinearProgress.tsx`
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/__tests__/LinearProgress.test.tsx`
- Modify: `index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LinearProgress } from '../LinearProgress';

describe('LinearProgress', () => {
  it('renders a bd-linear container with an ARIA progressbar role', () => {
    render(<LinearProgress value={40} data-testid="bar" />);
    const el = screen.getByTestId('bar');
    expect(el).toHaveClass('bd-linear');
    expect(el).toHaveAttribute('role', 'progressbar');
    expect(el).toHaveAttribute('aria-valuenow', '40');
    expect(el).toHaveAttribute('aria-valuemin', '0');
    expect(el).toHaveAttribute('aria-valuemax', '100');
  });

  it('sets the inner fill width equal to the clamped value%', () => {
    const { rerender } = render(<LinearProgress value={75} data-testid="bar" />);
    const fill = screen
      .getByTestId('bar')
      .querySelector<HTMLDivElement>('.bd-linear__fill');
    expect(fill).not.toBeNull();
    expect(fill!.style.width).toBe('75%');
    rerender(<LinearProgress value={150} data-testid="bar" />);
    expect(fill!.style.width).toBe('100%');
    rerender(<LinearProgress value={-20} data-testid="bar" />);
    expect(fill!.style.width).toBe('0%');
  });

  it('defaults to accent tone', () => {
    render(<LinearProgress value={10} data-testid="bar" />);
    const fill = screen
      .getByTestId('bar')
      .querySelector<HTMLDivElement>('.bd-linear__fill');
    expect(fill).toHaveClass('bd-linear__fill--accent');
  });

  it.each([
    ['success', 'bd-linear__fill--success'],
    ['warning', 'bd-linear__fill--warning'],
    ['error', 'bd-linear__fill--error'],
  ] as const)('applies %s tone class', (tone, expected) => {
    render(<LinearProgress value={50} tone={tone} data-testid="bar" />);
    const fill = screen
      .getByTestId('bar')
      .querySelector<HTMLDivElement>('.bd-linear__fill');
    expect(fill).toHaveClass(expected);
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

- [ ] **Step 3: Implement**

```tsx
import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export type LinearProgressTone = 'accent' | 'success' | 'warning' | 'error';

export interface LinearProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** Value 0..100. Clamped on render. */
  value: number;
  /** Fill tone. Default 'accent'. */
  tone?: LinearProgressTone;
}

/**
 * LinearProgress — 4px filled track.
 * Used by rate-limit meter, readiness bar, check suite aggregate.
 */
export function LinearProgress({
  value,
  tone = 'accent',
  className,
  ...rest
}: LinearProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={clsx('bd-linear', className)}
      {...rest}
    >
      <div
        className={clsx('bd-linear__fill', `bd-linear__fill--${tone}`)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Update barrel**

```ts
export { LinearProgress } from './LinearProgress';
export type { LinearProgressProps, LinearProgressTone } from './LinearProgress';
```

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/primitives/LinearProgress.tsx src/BorgDock.Tauri/src/components/shared/primitives/__tests__/LinearProgress.test.tsx src/BorgDock.Tauri/src/components/shared/primitives/index.ts
git commit -m "feat(primitives): add LinearProgress"
```

---

## Task 15: `Tabs` primitive

**Files:**
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/Tabs.tsx`
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Tabs.test.tsx`
- Modify: `index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Tabs } from '../Tabs';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'checks', label: 'Checks', count: 3 },
  { id: 'files', label: 'Files', count: 12 },
];

describe('Tabs', () => {
  it('renders a tablist with one button per tab', () => {
    render(<Tabs value="overview" onChange={() => {}} tabs={TABS} />);
    const list = screen.getByRole('tablist');
    expect(list).toHaveClass('bd-tabs');
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('highlights the active tab with bd-tab--active', () => {
    render(<Tabs value="checks" onChange={() => {}} tabs={TABS} />);
    const checks = screen.getByRole('tab', { name: /checks/i });
    expect(checks).toHaveClass('bd-tab--active');
    expect(checks).toHaveAttribute('aria-selected', 'true');
  });

  it('marks non-selected tabs as inactive', () => {
    render(<Tabs value="checks" onChange={() => {}} tabs={TABS} />);
    const overview = screen.getByRole('tab', { name: /overview/i });
    expect(overview).toHaveClass('bd-tab--inactive');
    expect(overview).toHaveAttribute('aria-selected', 'false');
  });

  it('renders the count badge when provided', () => {
    render(<Tabs value="overview" onChange={() => {}} tabs={TABS} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('omits the count badge when count is undefined', () => {
    render(<Tabs value="overview" onChange={() => {}} tabs={TABS} />);
    const overview = screen.getByRole('tab', { name: /overview/i });
    expect(overview.querySelector('.bd-tab__count')).toBeNull();
  });

  it('fires onChange with the tab id on click', () => {
    const onChange = vi.fn();
    render(<Tabs value="overview" onChange={onChange} tabs={TABS} />);
    fireEvent.click(screen.getByRole('tab', { name: /files/i }));
    expect(onChange).toHaveBeenCalledWith('files');
  });

  it('applies the dense modifier when dense=true', () => {
    render(<Tabs value="overview" onChange={() => {}} tabs={TABS} dense />);
    expect(screen.getByRole('tablist')).toHaveClass('bd-tabs--dense');
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

- [ ] **Step 3: Implement**

```tsx
import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export interface TabDef {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Currently selected tab id. */
  value: string;
  /** Fires on tab click with the new id. */
  onChange: (id: string) => void;
  /** Tab definitions in display order. */
  tabs: TabDef[];
  /** Tighter spacing — used by nested tab bars. Default false. */
  dense?: boolean;
}

/**
 * Tabs — horizontal tab bar with an animated underline on the active tab.
 * One primitive covers every tab bar in the app (PR detail, review, settings, focus subtabs, etc.).
 */
export function Tabs({
  value,
  onChange,
  tabs,
  dense = false,
  className,
  ...rest
}: TabsProps) {
  return (
    <div
      role="tablist"
      className={clsx('bd-tabs', dense && 'bd-tabs--dense', className)}
      {...rest}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={clsx('bd-tab', active ? 'bd-tab--active' : 'bd-tab--inactive')}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {tab.count !== undefined && <span className="bd-tab__count">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Update barrel**

```ts
export { Tabs } from './Tabs';
export type { TabDef, TabsProps } from './Tabs';
```

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/primitives/Tabs.tsx src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Tabs.test.tsx src/BorgDock.Tauri/src/components/shared/primitives/index.ts
git commit -m "feat(primitives): add Tabs"
```

---

## Task 16: `Input` primitive

**Files:**
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/Input.tsx`
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Input.test.tsx`
- Modify: `index.ts`

`Input` is a wrapper label + adornments + raw `<input>`. The outer wrapper carries the focus-within styling; the inner `<input>` stays transparent.

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Input } from '../Input';

describe('Input', () => {
  it('renders a bd-input wrapper containing an <input>', () => {
    render(<Input placeholder="Search" />);
    const input = screen.getByPlaceholderText('Search');
    expect(input.tagName).toBe('INPUT');
    expect(input.parentElement).toHaveClass('bd-input');
  });

  it('renders leading adornment when provided', () => {
    render(<Input placeholder="x" leading={<span data-testid="lead" />} />);
    expect(screen.getByTestId('lead')).toBeInTheDocument();
    expect(screen.getByTestId('lead').parentElement).toHaveClass('bd-input__adornment');
  });

  it('renders trailing adornment when provided', () => {
    render(<Input placeholder="x" trailing={<span data-testid="trail" />} />);
    expect(screen.getByTestId('trail').parentElement).toHaveClass('bd-input__adornment');
  });

  it('forwards input-level props (type, onChange, value)', () => {
    const onChange = vi.fn();
    render(<Input type="search" value="hi" onChange={onChange} />);
    const input = screen.getByDisplayValue('hi') as HTMLInputElement;
    expect(input.type).toBe('search');
    fireEvent.change(input, { target: { value: 'ho' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('forwards className onto the wrapper, not the input', () => {
    render(<Input className="extra" placeholder="x" />);
    const input = screen.getByPlaceholderText('x');
    expect(input).not.toHaveClass('extra');
    expect(input.parentElement).toHaveClass('extra');
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

- [ ] **Step 3: Implement**

```tsx
import clsx from 'clsx';
import type { InputHTMLAttributes, ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Rendered to the left of the input, inside the wrapper. */
  leading?: ReactNode;
  /** Rendered to the right of the input, inside the wrapper. */
  trailing?: ReactNode;
}

/**
 * Input — themed text field.
 * Wraps a transparent <input> with optional leading/trailing adornments.
 * `className` lands on the wrapper, not the input, so callers can tweak width.
 */
export function Input({ leading, trailing, className, ...rest }: InputProps) {
  return (
    <div className={clsx('bd-input', className)}>
      {leading !== undefined && <span className="bd-input__adornment">{leading}</span>}
      <input {...rest} />
      {trailing !== undefined && <span className="bd-input__adornment">{trailing}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Update barrel**

```ts
export { Input } from './Input';
export type { InputProps } from './Input';
```

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/primitives/Input.tsx src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Input.test.tsx src/BorgDock.Tauri/src/components/shared/primitives/index.ts
git commit -m "feat(primitives): add Input"
```

---

## Task 17: `Card` primitive

**Files:**
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/Card.tsx`
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Card.test.tsx`
- Modify: `index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Card } from '../Card';

describe('Card', () => {
  it('renders children inside a bd-card <div>', () => {
    render(<Card data-testid="c">hi</Card>);
    const el = screen.getByTestId('c');
    expect(el.tagName).toBe('DIV');
    expect(el).toHaveClass('bd-card');
    expect(el.textContent).toBe('hi');
  });

  it.each([
    ['sm', 'bd-card--pad-sm'],
    ['md', 'bd-card--pad-md'],
    ['lg', 'bd-card--pad-lg'],
  ] as const)('applies %s padding class', (padding, expected) => {
    render(
      <Card padding={padding} data-testid="c">
        x
      </Card>,
    );
    expect(screen.getByTestId('c')).toHaveClass(expected);
  });

  it('defaults to medium padding', () => {
    render(<Card data-testid="c">x</Card>);
    expect(screen.getByTestId('c')).toHaveClass('bd-card--pad-md');
  });

  it('adds bd-card--own for variant=own', () => {
    render(
      <Card variant="own" data-testid="c">
        x
      </Card>,
    );
    expect(screen.getByTestId('c')).toHaveClass('bd-card--own');
  });

  it('defaults variant to "default" with no own modifier', () => {
    render(<Card data-testid="c">x</Card>);
    expect(screen.getByTestId('c').className).not.toContain('bd-card--own');
  });

  it('adds bd-card--interactive and role=button when interactive', () => {
    const onClick = vi.fn();
    render(
      <Card interactive onClick={onClick} data-testid="c">
        x
      </Card>,
    );
    const el = screen.getByTestId('c');
    expect(el).toHaveClass('bd-card--interactive');
    expect(el).toHaveAttribute('role', 'button');
    expect(el).toHaveAttribute('tabindex', '0');
  });

  it('fires onClick when the interactive card is clicked', () => {
    const onClick = vi.fn();
    render(
      <Card interactive onClick={onClick} data-testid="c">
        x
      </Card>,
    );
    fireEvent.click(screen.getByTestId('c'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not expose a button role when non-interactive', () => {
    render(<Card data-testid="c">x</Card>);
    const el = screen.getByTestId('c');
    expect(el).not.toHaveAttribute('role');
    expect(el).not.toHaveAttribute('tabindex');
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

- [ ] **Step 3: Implement**

```tsx
import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export type CardVariant = 'default' | 'own';
export type CardPadding = 'sm' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 'own' adds the my-PR accent stripe on the left edge. */
  variant?: CardVariant;
  /** Padding preset. Default 'md'. */
  padding?: CardPadding;
  /** Hover + focus affordances + role=button. Default false. */
  interactive?: boolean;
  children: ReactNode;
}

/**
 * Card — the shared background container.
 * Replaces every ad-hoc card across PR list, Work Items, Settings, Notifications.
 */
export function Card({
  variant = 'default',
  padding = 'md',
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  const interactiveProps = interactive
    ? { role: 'button' as const, tabIndex: 0 }
    : {};
  return (
    <div
      className={clsx(
        'bd-card',
        variant === 'own' && 'bd-card--own',
        `bd-card--pad-${padding}`,
        interactive && 'bd-card--interactive',
        className,
      )}
      {...interactiveProps}
      {...rest}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Update barrel**

```ts
export { Card } from './Card';
export type { CardPadding, CardProps, CardVariant } from './Card';
```

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/primitives/Card.tsx src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Card.test.tsx src/BorgDock.Tauri/src/components/shared/primitives/index.ts
git commit -m "feat(primitives): add Card"
```

---

## Task 18: `Titlebar` primitive

**Files:**
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/Titlebar.tsx`
- Create: `src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Titlebar.test.tsx`
- Modify: `index.ts`

Titlebar is a shared chrome container with three slots — `left`, middle (auto-generated from `title` + `count` + `meta`), and `right`. When consumers pass `left`, the middle slot is replaced entirely. Spec §2 lists this as the 13th primitive; PR #2's `WindowTitleBar` composes `Titlebar` with `WindowControls`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Titlebar } from '../Titlebar';

describe('Titlebar', () => {
  it('renders the title inside a bd-titlebar container', () => {
    render(<Titlebar title="Pull Requests" data-testid="tb" />);
    const el = screen.getByTestId('tb');
    expect(el).toHaveClass('bd-titlebar');
    expect(screen.getByText('Pull Requests')).toHaveClass('bd-titlebar__title');
  });

  it('renders the count badge when provided', () => {
    render(<Titlebar title="PRs" count={4} />);
    const el = screen.getByText('4');
    expect(el).toHaveClass('bd-titlebar__count');
  });

  it('omits the count badge when count is undefined', () => {
    render(<Titlebar title="PRs" data-testid="tb" />);
    expect(screen.getByTestId('tb').querySelector('.bd-titlebar__count')).toBeNull();
  });

  it('shows count=0 (zero is a valid value)', () => {
    render(<Titlebar title="PRs" count={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders meta content in its own slot', () => {
    render(<Titlebar title="PRs" meta={<span data-testid="meta" />} />);
    expect(screen.getByTestId('meta').closest('.bd-titlebar__meta')).not.toBeNull();
  });

  it('replaces the default left slot entirely when left is passed', () => {
    render(
      <Titlebar
        title="PRs"
        count={99}
        left={<span data-testid="custom-left">custom</span>}
      />,
    );
    expect(screen.getByTestId('custom-left')).toBeInTheDocument();
    // The default title + count are NOT rendered when a custom left is supplied.
    expect(screen.queryByText('PRs')).not.toBeInTheDocument();
    expect(screen.queryByText('99')).not.toBeInTheDocument();
  });

  it('renders right slot content after the spacer', () => {
    render(<Titlebar title="PRs" right={<button type="button">Close</button>} />);
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('includes a flex spacer between middle and right', () => {
    render(<Titlebar title="PRs" data-testid="tb" />);
    expect(screen.getByTestId('tb').querySelector('.bd-titlebar__spacer')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

- [ ] **Step 3: Implement**

```tsx
import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export interface TitlebarProps extends HTMLAttributes<HTMLDivElement> {
  /** Default middle-slot title text. Ignored when `left` is supplied. */
  title?: ReactNode;
  /** Numeric badge rendered next to the title. Ignored when `left` is supplied. */
  count?: number;
  /** Meta content (e.g. breadcrumb, filter hint). Ignored when `left` is supplied. */
  meta?: ReactNode;
  /** Override the middle slot entirely. Useful when consumers need a composite title. */
  left?: ReactNode;
  /** Trailing slot — typically window controls or action buttons. */
  right?: ReactNode;
}

/**
 * Titlebar — shared chrome bar used by every window (main, flyout, palette, pr-detail, sql).
 * Slots: `left` (or auto-composed title/count/meta) — spacer — `right`.
 */
export function Titlebar({
  title,
  count,
  meta,
  left,
  right,
  className,
  ...rest
}: TitlebarProps) {
  return (
    <div className={clsx('bd-titlebar', className)} {...rest}>
      {left ?? (
        <>
          {title !== undefined && <span className="bd-titlebar__title">{title}</span>}
          {count !== undefined && <span className="bd-titlebar__count">{count}</span>}
          {meta !== undefined && <span className="bd-titlebar__meta">{meta}</span>}
        </>
      )}
      <span className="bd-titlebar__spacer" />
      {right}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Update barrel**

```ts
export { Titlebar } from './Titlebar';
export type { TitlebarProps } from './Titlebar';
```

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/primitives/Titlebar.tsx src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Titlebar.test.tsx src/BorgDock.Tauri/src/components/shared/primitives/index.ts
git commit -m "feat(primitives): add Titlebar"
```

---

## Task 19: Full barrel sanity + alphabetical sort

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/shared/primitives/index.ts` — rewrite to a canonical alphabetical form.

- [ ] **Step 1: Rewrite the barrel in alphabetical order**

After 13 primitives have landed, the barrel might be out of order depending on task execution order. Rewrite it to:

```ts
// Primitive components — shared visual vocabulary used by every surface.
// Alphabetical. Named exports only. Types exported alongside their component.

export { Avatar } from './Avatar';
export type { AvatarProps, AvatarSize, AvatarTone } from './Avatar';

export { Button } from './Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button';

export { Card } from './Card';
export type { CardPadding, CardProps, CardVariant } from './Card';

export { Chip } from './Chip';
export type { ChipProps, ChipTone } from './Chip';

export { Dot } from './Dot';
export type { DotProps, DotTone } from './Dot';

export { IconButton } from './IconButton';
export type { IconButtonProps, IconButtonSize } from './IconButton';

export { Input } from './Input';
export type { InputProps } from './Input';

export { Kbd } from './Kbd';
export type { KbdProps } from './Kbd';

export { LinearProgress } from './LinearProgress';
export type { LinearProgressProps, LinearProgressTone } from './LinearProgress';

export { Pill } from './Pill';
export type { PillProps, PillTone } from './Pill';

export { Ring } from './Ring';
export type { RingProps } from './Ring';

export { Tabs } from './Tabs';
export type { TabDef, TabsProps } from './Tabs';

export { Titlebar } from './Titlebar';
export type { TitlebarProps } from './Titlebar';
```

- [ ] **Step 2: Verify no primitive is missing**

Run: `cd ~/projects/borgdock-streamline-01 && ls src/BorgDock.Tauri/src/components/shared/primitives/*.tsx | wc -l`
Expected: `13`.

Run: `grep -c "^export " src/BorgDock.Tauri/src/components/shared/primitives/index.ts`
Expected: `26` (13 value exports + 13 type exports — Input has only `InputProps`, Kbd only `KbdProps`, Ring only `RingProps`, Titlebar only `TitlebarProps`, others have 2-3 type exports each in a single line). Count may differ — inspect manually that every primitive is represented.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/primitives/index.ts
git commit -m "chore(primitives): alphabetise barrel"
```

---

## Task 20: Full test + typecheck + build sweep

**Files:**
- No files modified; verification only.

- [ ] **Step 1: Typecheck**

Run: `cd ~/projects/borgdock-streamline-01/src/BorgDock.Tauri && npx tsc -b --noEmit 2>&1 | tail -20`
Expected: no errors. If any `noUnusedLocals` or `noUnusedParameters` errors fire in a primitive, fix in place (not by disabling the rule).

- [ ] **Step 2: Full vitest run with coverage**

Run: `cd ~/projects/borgdock-streamline-01/src/BorgDock.Tauri && npm test -- --coverage 2>&1 | tail -60`
Expected: every primitive test passes; coverage thresholds (90% statements/branches/functions/lines) are met. If a primitive drops below threshold, add tests exercising the missing branch.

- [ ] **Step 3: Biome lint**

Run: `cd ~/projects/borgdock-streamline-01/src/BorgDock.Tauri && npm run lint 2>&1 | tail -20`
Expected: no diagnostics. Fix any formatting issues with `npm run lint:fix`.

- [ ] **Step 4: Confirm no consumer imports the primitives yet**

Spec requires primitives to be unused in PR #1.

Run from `~/projects/borgdock-streamline-01/src/BorgDock.Tauri`:

```bash
grep -rn "from '@/components/shared/primitives\|from '../primitives\|from './primitives\|from \"@/components/shared/primitives" src --exclude-dir=node_modules --exclude-dir=__tests__ 2>&1 | head -20
```

Expected: zero matches. If any non-test file imports a primitive, revert that import — PR #2 handles the first consumer migration.

- [ ] **Step 5: Full production build**

Run: `cd ~/projects/borgdock-streamline-01/src/BorgDock.Tauri && npm run build 2>&1 | tail -20`
Expected: `tsc -b` passes then `vite build` reports `✓ built in …` with no warnings about missing theme variables.

- [ ] **Step 6: No commit** — verification only. If anything failed, fix before proceeding to Task 21.

---

## Task 21: Update the spec's Delivery Ledger

**Files:**
- Modify: `docs/superpowers/specs/2026-04-24-shared-components-design.md` — flip the PR #1 row from `Planned` to `In review` inside §9.1.

- [ ] **Step 1: Edit the ledger row**

In `docs/superpowers/specs/2026-04-24-shared-components-design.md`, find the row that begins with `| #1 | \`feat/streamline-01-foundation\` | Planned | — | — | — |`. Replace with:

```markdown
| #1 | `feat/streamline-01-foundation` | In review | — | — | Opened as stacked PR against `feat/streamline-00-regression-baseline`. |
```

- [ ] **Step 2: Commit**

```bash
cd ~/projects/borgdock-streamline-01
git add docs/superpowers/specs/2026-04-24-shared-components-design.md
git commit -m "docs(spec): mark PR #1 as in review"
```

---

## Task 22: Push the branch and open the pull request

**Files:**
- No files modified; git + gh operations only.

- [ ] **Step 1: Push the branch**

Run: `cd ~/projects/borgdock-streamline-01 && git push -u origin feat/streamline-01-foundation 2>&1`
Expected: `branch 'feat/streamline-01-foundation' set up to track 'origin/feat/streamline-01-foundation'`.

- [ ] **Step 2: Switch gh to the personal account**

Run: `gh auth switch --user borght-dev`
Expected: `Switched active account for github.com to borght-dev`.

- [ ] **Step 3: Open the PR against PR #0's branch**

Run:

```bash
gh pr create \
  --repo borght-dev/BorgDock \
  --base feat/streamline-00-regression-baseline \
  --head feat/streamline-01-foundation \
  --title "feat(streamline): PR #1 — foundation (tokens + primitives)" \
  --body "$(cat <<'EOF'
## Summary

Lands §4.1 (tokens) and §5 (13 primitives) of the streamline plan.

- `@theme inline` block promotes every semantic token into a Tailwind theme variable (`bg-surface`, `text-primary`, `rounded-lg`, `p-5`, `text-body`, `duration-color`, etc.) while keeping `.dark` overrides functional.
- New token families: `--space-1..12`, `--radius-sm/md/lg/xl/pill`, `--text-micro/small/body/base/title`, `--duration-press/color/ui/tab/breath`, `--font-ui`, `--elevation-1/2/3`, `--color-status-merged`.
- `bd-*` primitive shapes ported verbatim from the design prototype's `tokens.css` into `@layer components` in `src/styles/index.css` — gives the primitives pixel parity with the design baselines committed in PR #0.
- 13 primitives under `src/components/shared/primitives/` with unit tests: Avatar, Button, Card, Chip, Dot, IconButton, Input, Kbd, LinearProgress, Pill, Ring, Tabs, Titlebar.
- No consumer imports any primitive in this PR — migration starts in PR #2.

## Stacking

Base branch: \`feat/streamline-00-regression-baseline\` (PR #0). Merge PR #0 first.

## Test plan

- [ ] \`npm test\` passes with 90% coverage threshold met
- [ ] \`npx tsc -b --noEmit\` reports no errors
- [ ] \`npm run build\` succeeds on both mac and windows
- [ ] Playwright visual regression suite (mac + win) starts flipping green for surfaces that will migrate in PR #2+ — in this PR it still fails for every surface because consumers haven't been swapped yet. The test workflow from PR #0 runs on both CI jobs; those visual failures are expected until PR #7.
- [ ] Grep confirms no primitive is imported by non-test code

## Spec

Implements PR #1 row of \`docs/superpowers/specs/2026-04-24-shared-components-design.md\`. Ledger updated to \`In review\`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the resulting PR URL from stdout.

- [ ] **Step 4: Switch gh back to the enterprise account**

Run: `gh auth switch --user KvanderBorght_gomocha`
Expected: `Switched active account for github.com to KvanderBorght_gomocha`.

- [ ] **Step 5: Report the PR URL**

Report the URL captured in Step 3 back to the user.

---

## Self-Review checklist (run before declaring the plan done — the implementer should NOT skip this)

- Every spec §4.1 bullet is covered: ✅ `@theme inline` in Task 3; ✅ spacing/radius/type/motion/font custom properties in Task 2; ✅ dark-mode `.dark` overrides continue working because `@theme inline` emits `var(--…)` references.
- Every primitive in §5 has its own task (Tasks 6–18): ✅ Pill, Dot, Avatar, Kbd, Button, IconButton, Chip, Ring, LinearProgress, Tabs, Input, Card, Titlebar = 13 primitives.
- Every primitive has unit tests covering: all tones, all sizes, default values, optional props, event handling, and (where applicable) a11y attributes.
- Barrel is named-export-only and alphabetical (Task 19).
- No consumer imports the primitives (Task 20 Step 4 verifies this).
- Ledger updated (Task 21).
- PR opened stacked on PR #0 with `borght-dev` account, then switched back (Task 22).
- No placeholders, no "similar to Task N", no "TODO" text — every task contains full code ready to paste.
