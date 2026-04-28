# Streamline PR #2 — Chrome: Titlebar, StatusBar, Tabs Vocabulary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every window chrome surface — titlebar buttons, status bars, tab bars — onto the primitives landed in PR #1, so the app speaks a single shared vocabulary for chrome and the legacy `.window-titlebar*`, `.window-ctrl-btn*`, `.sidebar-section-btn*`, `.sql-status-*` CSS classes can be deleted.

**Architecture:** Introduce two new composed-chrome components under `src/components/shared/chrome/` — `WindowControls.tsx` (minimize / maximize / close cluster) and `StatusBar.tsx` (generalized footer bar with `left` / `right` slots). Rewrite `shared/WindowTitleBar.tsx` on top of the `Titlebar` primitive + `WindowControls`. Swap the two existing tab bars (`pr-detail/PRDetailPanel` Overview/Commits/Files/Checks/Reviews/Comments; `layout/Header` Focus/PRs/Work Items) to the `Tabs` primitive. Migrate `layout/StatusBar` + `sql/SqlApp`'s status bar to the chrome `StatusBar`. Delete the now-unused legacy CSS blocks.

**Tech Stack:** React 19 + TypeScript, Tailwind v4 `@theme`, Vitest + Testing Library for unit tests, Playwright (webview-mac / webview-win projects) for behavioral + visual + a11y regression. Primitives at `src/BorgDock.Tauri/src/components/shared/primitives/` (PR #1). Chrome composed components at `src/BorgDock.Tauri/src/components/shared/chrome/` (this PR). Work happens in worktree `~/projects/borgdock-streamline-02` on branch `feat/streamline-02-chrome`, stacked on `feat/streamline-01-foundation`.

---

## Scope notes — what this PR does NOT touch

The spec §8 PR #2 row says "every tab bar swaps to `Tabs` primitive (pr-detail, section switcher, review tabs, settings tabs, focus sub-tabs)". In the code today, the latter three don't exist:

- **Review tabs** — `components/review/ClaudeReviewPanel.tsx` groups comments by severity with collapsible headers; it has no tab bar. The design mockup may introduce one; that addition belongs in PR #4 (PR detail surfaces) when the review surface is redesigned.
- **Settings tabs** — `components/settings/SettingsFlyout.tsx` stacks `SectionCard`s; no tabs. Any tabification belongs in PR #6 (ancillary: settings).
- **Focus sub-tabs** — `components/focus/*` renders a list; no sub-tabs. Any tabification belongs in PR #3 (PR surfaces: main + flyout + Focus).

This PR only migrates the two tab bars that actually exist today (PR detail + Header section switcher). The spec §3 non-goal "Redesigning features beyond what the mockups specify" keeps us from adding new tabs in PR #2.

---

## Prerequisites

- [ ] **Prereq 1: Confirm worktree and dependencies**

Run from `~/projects/borgdock-streamline-02`:

```bash
git branch --show-current
# Expected: feat/streamline-02-chrome

git log --oneline -1
# Expected: ba6ef495 docs(spec): mark PR #1 as in review (or newer if PR #1 rebased)
```

Install dependencies (the `-02` worktree is freshly created and needs its own `node_modules/`):

```bash
cd src/BorgDock.Tauri
npm install
```

Expected: dependency install completes without errors.

- [ ] **Prereq 2: Confirm baseline test state**

Run the PR #1 test suite to confirm primitives tests pass on this branch:

```bash
cd src/BorgDock.Tauri
npm test -- --run src/components/shared/primitives
```

Expected: all primitive tests pass (Titlebar, Tabs, Button, etc. — green from PR #1).

If any primitive test fails, **stop and diagnose** — the chrome work depends on primitives being correct. Don't fix by editing the primitive unless the fix is a PR #1 bug; in that case, escalate.

---

## File Structure

**Create:**
- `src/BorgDock.Tauri/src/components/shared/chrome/WindowControls.tsx` — minimize/maximize/close cluster, takes Tauri window handle or callbacks.
- `src/BorgDock.Tauri/src/components/shared/chrome/StatusBar.tsx` — generalized footer with `left` / `right` slots.
- `src/BorgDock.Tauri/src/components/shared/chrome/index.ts` — barrel.
- `src/BorgDock.Tauri/src/components/shared/chrome/__tests__/WindowControls.test.tsx`
- `src/BorgDock.Tauri/src/components/shared/chrome/__tests__/StatusBar.test.tsx`

**Modify:**
- `src/BorgDock.Tauri/src/components/shared/WindowTitleBar.tsx` — rewrite on `Titlebar` + `WindowControls`.
- `src/BorgDock.Tauri/src/components/shared/__tests__/WindowTitleBar.test.tsx` — update for new structure (keep behavioral assertions).
- `src/BorgDock.Tauri/src/components/pr-detail/PRDetailPanel.tsx` — tabs → `Tabs` primitive; pop-out window controls → `WindowControls`.
- `src/BorgDock.Tauri/src/components/pr-detail/__tests__/PRDetailPanel.test.tsx` — adjust selectors.
- `src/BorgDock.Tauri/src/components/layout/Header.tsx` — section switcher → `Tabs` primitive (dense=true).
- `src/BorgDock.Tauri/src/components/layout/__tests__/Header.test.tsx` — adjust selectors.
- `src/BorgDock.Tauri/src/components/layout/StatusBar.tsx` — consume chrome `StatusBar`.
- `src/BorgDock.Tauri/src/components/sql/SqlApp.tsx` — replace `.sql-status-bar` footer with chrome `StatusBar`.
- `src/BorgDock.Tauri/src/styles/index.css` — add `.bd-wc*` + `.bd-statusbar*` classes to `@layer components`; delete legacy `.window-titlebar*` (1795-1846), `.window-ctrl-group` + `.window-ctrl-btn*` (1880-1925), `.sidebar-section-btn*` (1047-1071), `.sql-status-bar` + helpers (2262-2321).
- `docs/superpowers/specs/2026-04-24-shared-components-design.md` — Delivery Ledger row for PR #2 → "In review".

**Leave alone:**
- `src/BorgDock.Tauri/src/components/shared/primitives/*` (locked by PR #1).
- Focus / Review / Settings surfaces (not in scope — see "Scope notes").

---

## Task 1: `WindowControls` chrome primitive

**Files:**
- Create: `src/BorgDock.Tauri/src/components/shared/chrome/WindowControls.tsx`
- Create: `src/BorgDock.Tauri/src/components/shared/chrome/__tests__/WindowControls.test.tsx`

Three buttons: minimize, maximize (doubles as restore), close. The prototype (`tests/e2e/design-bundle/borgdock/project/components/primitives.jsx`) shows optional leading pin/settings slots, but PR #2 only needs min/max/close — the flyout-specific pin/settings buttons stay feature-local. API takes three optional `onMinimize` / `onMaximize` / `onClose` callbacks — consumers wire these to the Tauri window. Separation from the Tauri API keeps the component testable with plain spies.

- [ ] **Step 1.1: Write the failing test**

Write `src/BorgDock.Tauri/src/components/shared/chrome/__tests__/WindowControls.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WindowControls } from '../WindowControls';

describe('WindowControls', () => {
  it('renders minimize, maximize, and close buttons by default', () => {
    render(<WindowControls />);
    expect(screen.getByRole('button', { name: 'Minimize' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maximize' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('fires onMinimize when the minimize button is clicked', () => {
    const onMinimize = vi.fn();
    render(<WindowControls onMinimize={onMinimize} />);
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    expect(onMinimize).toHaveBeenCalledOnce();
  });

  it('fires onMaximize when the maximize button is clicked', () => {
    const onMaximize = vi.fn();
    render(<WindowControls onMaximize={onMaximize} />);
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    expect(onMaximize).toHaveBeenCalledOnce();
  });

  it('fires onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<WindowControls onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('marks the close button with the destructive variant class', () => {
    render(<WindowControls />);
    expect(screen.getByRole('button', { name: 'Close' }).className).toContain('bd-wc--close');
  });

  it('omits a callback silently — button still renders but click is a no-op', () => {
    render(<WindowControls />);
    // Should not throw
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd src/BorgDock.Tauri
npm test -- --run src/components/shared/chrome/__tests__/WindowControls.test.tsx
```

Expected: FAIL with "Cannot find module '../WindowControls'".

- [ ] **Step 1.3: Write the implementation**

Write `src/BorgDock.Tauri/src/components/shared/chrome/WindowControls.tsx`:

```tsx
import clsx from 'clsx';

export interface WindowControlsProps {
  /** Fires when the minimize button is clicked. No-op if omitted. */
  onMinimize?: () => void;
  /** Fires when the maximize button is clicked. No-op if omitted. */
  onMaximize?: () => void;
  /** Fires when the close button is clicked. No-op if omitted. */
  onClose?: () => void;
  /** Additional class on the container. */
  className?: string;
}

/**
 * WindowControls — native-style minimize/maximize/close cluster for chromeless windows.
 * Renders three icon buttons. Rendered as a `-webkit-app-region: no-drag` group so clicks
 * reach the buttons even when the parent titlebar is a Tauri drag region.
 */
export function WindowControls({
  onMinimize,
  onMaximize,
  onClose,
  className,
}: WindowControlsProps) {
  return (
    <div className={clsx('bd-wc-group', className)}>
      <button type="button" className="bd-wc" onClick={onMinimize} aria-label="Minimize">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      <button type="button" className="bd-wc" onClick={onMaximize} aria-label="Maximize">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <rect
            x="1.5"
            y="1.5"
            width="7"
            height="7"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
      </button>
      <button
        type="button"
        className="bd-wc bd-wc--close"
        onClick={onClose}
        aria-label="Close"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M2 2l6 6M8 2l-6 6"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 1.4: Add `bd-wc*` CSS to `@layer components`**

Open `src/BorgDock.Tauri/src/styles/index.css`. Find the `@layer components` block that holds `.bd-titlebar` (near line 2864). Add a new section before `.bd-titlebar` (or after `.bd-tab`, wherever reads naturally):

```css
  /* ── Window Controls ─────────────────────────────── */
  .bd-wc-group {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    -webkit-app-region: no-drag;
  }
  .bd-wc {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 28px;
    border: none;
    background: transparent;
    color: var(--color-icon-btn-fg);
    border-radius: 6px;
    cursor: pointer;
    transition:
      background var(--duration-color) ease,
      color var(--duration-color) ease,
      transform var(--duration-press) ease;
  }
  .bd-wc:hover {
    background: var(--color-icon-btn-hover);
    color: var(--color-text-primary);
  }
  .bd-wc:active:not(:disabled) {
    background: var(--color-icon-btn-pressed);
    transform: scale(0.92);
  }
  .bd-wc:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }
  .bd-wc--close:hover {
    background: #e81123;
    color: #ffffff;
  }
  .bd-wc--close:active:not(:disabled) {
    background: #b40d1b;
    color: #ffffff;
    transform: scale(0.92);
  }
```

**Why these tokens:** matches the legacy `.window-ctrl-btn` rules being deleted in Task 9 (same sizing, same transitions, same close-button red). The `#e81123` / `#b40d1b` close-hover reds are intentional Windows conventions — they stay hardcoded in the CSS since there's no semantic token for them. `var(--duration-color)` / `var(--duration-press)` come from PR #1's token promotion.

- [ ] **Step 1.5: Run test to verify it passes**

```bash
cd src/BorgDock.Tauri
npm test -- --run src/components/shared/chrome/__tests__/WindowControls.test.tsx
```

Expected: 6 tests pass.

- [ ] **Step 1.6: Create the chrome barrel**

Write `src/BorgDock.Tauri/src/components/shared/chrome/index.ts`:

```ts
// Composed chrome components — titlebar window-controls cluster, status-bar footer.
// Built on top of `shared/primitives/`. Named exports only.

export { WindowControls } from './WindowControls';
export type { WindowControlsProps } from './WindowControls';
```

- [ ] **Step 1.7: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/chrome/ src/BorgDock.Tauri/src/styles/index.css
git commit -m "feat(chrome): add WindowControls primitive"
```

---

## Task 2: Rewrite `WindowTitleBar` on `Titlebar` + `WindowControls`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/shared/WindowTitleBar.tsx`
- Modify: `src/BorgDock.Tauri/src/components/shared/__tests__/WindowTitleBar.test.tsx`

The existing `WindowTitleBar` is imported by `sql/SqlApp.tsx`, `work-items/WorkItemDetailApp.tsx`, and mocked by `pr-detail/__tests__/PRDetailApp.test.tsx` + `whats-new/__tests__/WhatsNewApp.test.tsx`. Keep the `title` prop so those imports stay valid. Under the hood: compose `<Titlebar left={<span className="bd-titlebar__title">{title}</span>} right={<WindowControls ... />} />` with `data-tauri-drag-region` on the outer element.

- [ ] **Step 2.1: Update the failing test first (red)**

Open `src/BorgDock.Tauri/src/components/shared/__tests__/WindowTitleBar.test.tsx` and **replace** the file with:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const minimizeMock = vi.fn();
const maximizeMock = vi.fn();
const unmaximizeMock = vi.fn();
const closeMock = vi.fn();
const isMaximizedMock = vi.fn();

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: minimizeMock,
    maximize: maximizeMock,
    unmaximize: unmaximizeMock,
    close: closeMock,
    isMaximized: isMaximizedMock,
  }),
}));

import { WindowTitleBar } from '../WindowTitleBar';

describe('WindowTitleBar', () => {
  beforeEach(() => {
    minimizeMock.mockReset().mockResolvedValue(undefined);
    maximizeMock.mockReset().mockResolvedValue(undefined);
    unmaximizeMock.mockReset().mockResolvedValue(undefined);
    closeMock.mockReset().mockResolvedValue(undefined);
    isMaximizedMock.mockReset().mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the title', () => {
    render(<WindowTitleBar title="My Window" />);
    expect(screen.getByText('My Window')).toBeInTheDocument();
  });

  it('marks the bar as a Tauri drag region', () => {
    const { container } = render(<WindowTitleBar title="Test" />);
    const bar = container.querySelector('[data-tauri-drag-region]');
    expect(bar).not.toBeNull();
  });

  it('calls window.minimize when the Minimize button is clicked', () => {
    render(<WindowTitleBar title="Test" />);
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    expect(minimizeMock).toHaveBeenCalledOnce();
  });

  it('calls window.maximize when Maximize is clicked on a non-maximized window', async () => {
    isMaximizedMock.mockResolvedValueOnce(false);
    render(<WindowTitleBar title="Test" />);
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    // Allow the async isMaximized check to resolve
    await new Promise((r) => setTimeout(r, 0));
    expect(maximizeMock).toHaveBeenCalledOnce();
    expect(unmaximizeMock).not.toHaveBeenCalled();
  });

  it('calls window.unmaximize when Maximize is clicked on a maximized window', async () => {
    isMaximizedMock.mockResolvedValueOnce(true);
    render(<WindowTitleBar title="Test" />);
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(unmaximizeMock).toHaveBeenCalledOnce();
    expect(maximizeMock).not.toHaveBeenCalled();
  });

  it('calls window.close when the Close button is clicked', () => {
    render(<WindowTitleBar title="Test" />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closeMock).toHaveBeenCalledOnce();
  });

  it('re-renders correctly when the title changes', () => {
    const { rerender } = render(<WindowTitleBar title="First" />);
    expect(screen.getByText('First')).toBeInTheDocument();
    rerender(<WindowTitleBar title="Second" />);
    expect(screen.getByText('Second')).toBeInTheDocument();
  });
});
```

**Why these specific tests:** they lift every behavioral assertion from the old test file (minimize, maximize-when-not-max, unmaximize-when-max, close, drag region, title rendering, re-render). The exact assertions are different (role+name rather than class selectors) because the rewrite swaps `.window-titlebar-btn` for `WindowControls` markup — but the user-facing contract is identical. If any of these fail after the rewrite, we've broken a real behavior.

- [ ] **Step 2.2: Run test to verify the old implementation fails**

```bash
cd src/BorgDock.Tauri
npm test -- --run src/components/shared/__tests__/WindowTitleBar.test.tsx
```

Expected: several FAIL — the old implementation uses `.window-titlebar-btn` but we now query by role+name, and the legacy aria-label `Maximize` is on an SVG-only button (test will still find it by aria-label, so the MAX/RESTORE behavior tests will pass, but the drag-region assertion + title text assertion may fail depending on class selectors).

If all tests unexpectedly pass against the old component — that's a red flag. Re-read the diff between old tests (`screen.getByText`, `className`-based) and new tests (role-based, `data-tauri-drag-region`-based). A failure on at least one test is required before proceeding.

- [ ] **Step 2.3: Rewrite `WindowTitleBar`**

Replace `src/BorgDock.Tauri/src/components/shared/WindowTitleBar.tsx` with:

```tsx
import type { Window } from '@tauri-apps/api/window';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useRef } from 'react';
import { WindowControls } from './chrome/WindowControls';
import { Titlebar } from './primitives/Titlebar';

interface WindowTitleBarProps {
  title: string;
}

/** Lazily resolve the Tauri window handle — avoids crashing during render
 *  when `__TAURI_INTERNALS__` isn't injected yet (race on window creation). */
function useTauriWindow(): Window | null {
  const ref = useRef<Window | null | undefined>(undefined);
  if (ref.current === undefined) {
    try {
      ref.current = getCurrentWindow();
    } catch {
      ref.current = null;
    }
  }
  return ref.current;
}

export function WindowTitleBar({ title }: WindowTitleBarProps) {
  const win = useTauriWindow();

  const handleMinimize = useCallback(() => {
    win?.minimize().catch(console.debug); /* fire-and-forget */
  }, [win]);

  const handleMaximize = useCallback(async () => {
    if (!win) return;
    const isMax = await win.isMaximized();
    if (isMax) {
      win.unmaximize().catch(console.debug); /* fire-and-forget */
    } else {
      win.maximize().catch(console.debug); /* fire-and-forget */
    }
  }, [win]);

  const handleClose = useCallback(() => {
    win?.close().catch(console.debug); /* fire-and-forget */
  }, [win]);

  return (
    <Titlebar
      data-tauri-drag-region
      onDoubleClick={handleMaximize}
      left={<span className="bd-titlebar__title">{title}</span>}
      right={
        <WindowControls
          onMinimize={handleMinimize}
          onMaximize={handleMaximize}
          onClose={handleClose}
        />
      }
    />
  );
}
```

- [ ] **Step 2.4: Run test to verify it passes**

```bash
cd src/BorgDock.Tauri
npm test -- --run src/components/shared/__tests__/WindowTitleBar.test.tsx
```

Expected: 7 tests pass.

- [ ] **Step 2.5: Run broader test sweep to catch regressions**

The rewrite changes the DOM of `WindowTitleBar`. Any test that mocks or queries its markup could break:

```bash
cd src/BorgDock.Tauri
npm test -- --run src/components/sql src/components/work-items src/components/pr-detail src/components/whats-new
```

Expected: all pass. If `PRDetailApp.test.tsx` or `WhatsNewApp.test.tsx` fails because their `WindowTitleBar` mock no longer matches the component signature, update the mock to render `<div>{title}</div>` (or similar) — the `title` prop is the only part of the contract they rely on.

- [ ] **Step 2.6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/WindowTitleBar.tsx src/BorgDock.Tauri/src/components/shared/__tests__/WindowTitleBar.test.tsx
git commit -m "feat(shared): rewrite WindowTitleBar on Titlebar + WindowControls primitives"
```

---

## Task 3: Migrate PR detail pop-out window controls to `WindowControls`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/pr-detail/PRDetailPanel.tsx:149-193`

The PR detail panel renders its own `.window-ctrl-group` cluster when `popOutWindow` is true (lines 149-193). This is the same legacy CSS being deleted in Task 9 — it must migrate to `WindowControls` so the delete is safe.

- [ ] **Step 3.1: Read current state**

Open `src/BorgDock.Tauri/src/components/pr-detail/PRDetailPanel.tsx`. Confirm lines 148-194 hold the `popOutWindow && (<div className="window-ctrl-group"> … </div>)` block with three inline-SVG buttons.

- [ ] **Step 3.2: Swap the cluster for `WindowControls`**

Edit `PRDetailPanel.tsx`. Add this import near the top (after the `import { createLogger } from '@/services/logger';` line):

```tsx
import { WindowControls } from '@/components/shared/chrome';
```

Replace the entire `{popOutWindow && ( ... )}` block (lines 148-194) with:

```tsx
        {popOutWindow && (
          <WindowControls
            onMinimize={handleMinimize}
            onMaximize={handleToggleMaximize}
            onClose={handleClose}
            className="-my-1 -mr-1"
          />
        )}
```

**Why the negative margins:** the surrounding header has `py-2.5 px-3`; the original inline cluster used `-my-1 -mr-1` to bleed to the edge so the close button hit the true corner. Keep that — WindowControls' `bd-wc` buttons are 36×28, and the parent `Titlebar` primitive has 36px height, so the offset is preserved.

- [ ] **Step 3.3: Run PR detail panel tests**

```bash
cd src/BorgDock.Tauri
npm test -- --run src/components/pr-detail/__tests__/PRDetailPanel.test.tsx
```

Expected: all pass. If a test queries `.window-ctrl-btn` directly, update it to query by `role="button"` with `name="Close" | "Minimize" | "Maximize"`.

- [ ] **Step 3.4: Commit**

```bash
git add src/BorgDock.Tauri/src/components/pr-detail/PRDetailPanel.tsx src/BorgDock.Tauri/src/components/pr-detail/__tests__/PRDetailPanel.test.tsx
git commit -m "refactor(pr-detail): migrate pop-out window controls to WindowControls primitive"
```

---

## Task 4: `StatusBar` chrome primitive

**Files:**
- Create: `src/BorgDock.Tauri/src/components/shared/chrome/StatusBar.tsx`
- Create: `src/BorgDock.Tauri/src/components/shared/chrome/__tests__/StatusBar.test.tsx`

Generalize the footer pattern — a 26-28px bar along the bottom of a window with a `left` slot and `right` slot, mono-font by default, subtle border-top. Today we have two instances: `layout/StatusBar.tsx` (Tailwind inline) and `sql/SqlApp.tsx`'s `.sql-status-bar` (legacy CSS). This primitive becomes the single source.

- [ ] **Step 4.1: Write the failing test**

Write `src/BorgDock.Tauri/src/components/shared/chrome/__tests__/StatusBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBar } from '../StatusBar';

describe('StatusBar', () => {
  it('renders the left and right slots', () => {
    render(<StatusBar left={<span>L</span>} right={<span>R</span>} />);
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('R')).toBeInTheDocument();
  });

  it('applies the bd-statusbar class to the root', () => {
    const { container } = render(<StatusBar left={<span>x</span>} />);
    const root = container.firstElementChild;
    expect(root?.className).toContain('bd-statusbar');
  });

  it('renders without a right slot', () => {
    render(<StatusBar left={<span>alone</span>} />);
    expect(screen.getByText('alone')).toBeInTheDocument();
  });

  it('renders without a left slot', () => {
    render(<StatusBar right={<span>lone-right</span>} />);
    expect(screen.getByText('lone-right')).toBeInTheDocument();
  });

  it('passes through additional className', () => {
    const { container } = render(<StatusBar className="custom-bar" left={<span>x</span>} />);
    expect(container.firstElementChild?.className).toContain('custom-bar');
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
cd src/BorgDock.Tauri
npm test -- --run src/components/shared/chrome/__tests__/StatusBar.test.tsx
```

Expected: FAIL with "Cannot find module '../StatusBar'".

- [ ] **Step 4.3: Write the implementation**

Write `src/BorgDock.Tauri/src/components/shared/chrome/StatusBar.tsx`:

```tsx
import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export interface StatusBarProps extends HTMLAttributes<HTMLDivElement> {
  /** Left-aligned content — typically primary metrics (PR counts, row counts). */
  left?: ReactNode;
  /** Right-aligned content — typically rate / sync / copy status. */
  right?: ReactNode;
}

/**
 * StatusBar — generalized footer chrome with left/right slots.
 * Used by the main sidebar, SQL query window, and any other window footer showing
 * sync / rate-limit / connection state.
 */
export function StatusBar({ left, right, className, ...rest }: StatusBarProps) {
  return (
    <div className={clsx('bd-statusbar', className)} {...rest}>
      <div className="bd-statusbar__side">{left}</div>
      <div className="bd-statusbar__side bd-statusbar__side--end">{right}</div>
    </div>
  );
}
```

- [ ] **Step 4.4: Add `bd-statusbar*` CSS to `@layer components`**

Open `src/BorgDock.Tauri/src/styles/index.css`. In the `@layer components` block (the same block where `bd-wc` was added in Task 1), add:

```css
  /* ── StatusBar ───────────────────────────────────── */
  .bd-statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: 26px;
    padding: 0 var(--space-3);
    background: var(--color-status-bar-bg);
    border-top: 1px solid var(--color-separator);
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-muted);
    flex-shrink: 0;
  }
  .bd-statusbar__side {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }
  .bd-statusbar__side--end {
    flex-shrink: 0;
  }
```

**Why these tokens:** `--color-status-bar-bg` already exists as a semantic token (light: `rgba(247, 245, 251, 0.88)`, dark: `rgba(17, 15, 26, 0.6)`). The spec §4.1 promotes `--space-*` and `--text-*` variables — `--space-3` = 6px, `--text-micro` = 10px, `--font-mono` = tabular digits. This pixel-matches the existing Tailwind `layout/StatusBar` (26px height, 10px mono, subtle border-top).

- [ ] **Step 4.5: Run test to verify it passes**

```bash
cd src/BorgDock.Tauri
npm test -- --run src/components/shared/chrome/__tests__/StatusBar.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 4.6: Export from chrome barrel**

Edit `src/BorgDock.Tauri/src/components/shared/chrome/index.ts` — append:

```ts
export { StatusBar } from './StatusBar';
export type { StatusBarProps } from './StatusBar';
```

Full file after edit:

```ts
// Composed chrome components — titlebar window-controls cluster, status-bar footer.
// Built on top of `shared/primitives/`. Named exports only.

export { StatusBar } from './StatusBar';
export type { StatusBarProps } from './StatusBar';

export { WindowControls } from './WindowControls';
export type { WindowControlsProps } from './WindowControls';
```

- [ ] **Step 4.7: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/chrome/StatusBar.tsx src/BorgDock.Tauri/src/components/shared/chrome/__tests__/StatusBar.test.tsx src/BorgDock.Tauri/src/components/shared/chrome/index.ts src/BorgDock.Tauri/src/styles/index.css
git commit -m "feat(chrome): add StatusBar primitive"
```

---

## Task 5: Migrate `layout/StatusBar` to chrome `StatusBar`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/layout/StatusBar.tsx`

Current file uses inline Tailwind (`flex shrink-0 items-center justify-between border-t border-[var(--color-separator)] px-2.5` + inline style height/font). Replace the root `<div>` with the chrome `StatusBar`; keep all the data logic (pr-store subscriptions, counts, rate-limit, formatTimeAgo) identical — it's the wrapper that changes.

- [ ] **Step 5.1: Rewrite `layout/StatusBar.tsx`**

Replace `src/BorgDock.Tauri/src/components/layout/StatusBar.tsx` with:

```tsx
import { StatusBar as ChromeStatusBar } from '@/components/shared/chrome';
import { usePrStore } from '@/stores/pr-store';

function formatTimeAgo(date: Date | null): string {
  if (!date) return 'Never';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function StatusBar() {
  const pullRequests = usePrStore((s) => s.pullRequests);
  const rateLimit = usePrStore((s) => s.rateLimit);
  const lastPollTime = usePrStore((s) => s.lastPollTime);
  const getCounts = usePrStore((s) => s.counts);

  // Subscribe to deps so counts re-evaluates
  const username = usePrStore((s) => s.username);
  const closedPullRequests = usePrStore((s) => s.closedPullRequests);
  void username;
  void closedPullRequests;
  void pullRequests;

  const counts = getCounts();

  return (
    <ChromeStatusBar
      left={
        <>
          <span className="font-medium">{counts.all} PRs</span>
          {counts.failing > 0 && (
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--color-status-red)' }}
              />
              <span style={{ color: 'var(--color-status-red)' }}>{counts.failing} failing</span>
            </span>
          )}
          {counts.ready > 0 && (
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--color-status-green)' }}
              />
              <span style={{ color: 'var(--color-status-green)' }}>{counts.ready} ready</span>
            </span>
          )}
        </>
      }
      right={
        <>
          {rateLimit && (
            <span
              className="tabular-nums"
              title={`GitHub API: ${rateLimit.remaining} of ${rateLimit.limit} remaining`}
            >
              {rateLimit.remaining}/{rateLimit.limit}
            </span>
          )}
          <span className="inline-block h-0.5 w-0.5 rounded-full bg-[var(--color-text-ghost)]" />
          <span>{formatTimeAgo(lastPollTime)}</span>
        </>
      }
    />
  );
}
```

- [ ] **Step 5.2: Run layout tests to confirm no regressions**

```bash
cd src/BorgDock.Tauri
npm test -- --run src/components/layout
```

Expected: all pass.

- [ ] **Step 5.3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/layout/StatusBar.tsx
git commit -m "refactor(layout): migrate StatusBar to shared chrome primitive"
```

---

## Task 6: Migrate SQL window status bar to chrome `StatusBar`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/sql/SqlApp.tsx:514-565`

The SQL status bar is the most complex status-bar instance — rows count, execution time, selection count, copy flash, copy group. All of these are still rendered as-is; only the wrapping `<div className="sql-status-bar">` is replaced. The internal helper classes (`.sql-status-left`, `.sql-status-rows`, `.sql-status-dot`, `.sql-status-time`, `.sql-status-selected`, `.sql-status-right`, `.sql-copy-flash`, `.sql-copy-group`) stay in index.css for now because:

1. They style *content* inside the bar, not the bar itself.
2. Deleting them would require rewriting the copy-group + flash animation too — that's a bigger cleanup for PR #5 (palettes) or whenever SQL gets its full primitives migration.

Only the bar chrome (`.sql-status-bar`) is deleted in Task 9; the content helpers remain. That's a deliberate scope boundary — this PR is chrome.

- [ ] **Step 6.1: Rewrite the SQL footer JSX**

Edit `src/BorgDock.Tauri/src/components/sql/SqlApp.tsx`. Add to the imports (after the `WindowTitleBar` import):

```tsx
import { StatusBar } from '@/components/shared/chrome';
```

Replace lines 514-565 (the `{/* ── Status bar ─── */}` block through the closing `</div>` of `.sql-status-bar`) with:

```tsx
      {/* ── Status bar ──────────────────────────────────── */}
      <StatusBar
        left={
          result && (
            <>
              <span className="sql-status-rows">
                {result.totalRowCount.toLocaleString()} row{result.totalRowCount !== 1 ? 's' : ''}
                {result.resultSets.length > 1 && (
                  <span className="sql-status-sets">
                    {' '}
                    · {result.resultSets.filter((rs) => rs.columns.length > 0).length} results
                  </span>
                )}
                {result.resultSets.some((rs) => rs.truncated) && (
                  <span className="sql-status-truncated"> (truncated)</span>
                )}
              </span>
              <span className="sql-status-dot" />
              <span className="sql-status-time">{result.executionTimeMs}ms</span>
              {totalSelectedRows > 0 && (
                <>
                  <span className="sql-status-dot" />
                  <span className="sql-status-selected">{totalSelectedRows} selected</span>
                </>
              )}
            </>
          )
        }
        right={
          <>
            {copyFlash && (
              <span className="sql-copy-flash">
                <CheckIcon />
                {copyFlash}
              </span>
            )}
            {result && totalRows > 0 && (
              <div className="sql-copy-group">
                <CopyIcon />
                <button className="sql-copy-btn" onClick={copyValues}>
                  Values
                </button>
                <button className="sql-copy-btn" onClick={copyWithHeaders}>
                  + Headers
                </button>
                <button className="sql-copy-btn" onClick={copyAll}>
                  All
                </button>
              </div>
            )}
          </>
        }
      />
```

- [ ] **Step 6.2: Run SQL tests**

```bash
cd src/BorgDock.Tauri
npm test -- --run src/components/sql
```

Expected: all pass.

- [ ] **Step 6.3: Run the sql e2e spec**

```bash
cd src/BorgDock.Tauri
npm run test:e2e -- tests/e2e/sql.spec.ts --project webview-mac
```

Expected: behavioral assertions (run-query, results render, status-bar shows row count) all pass. If any fail on a status-bar query (`.sql-status-bar`), note the failure for Task 10 — we may need to update the selector to `.bd-statusbar`.

- [ ] **Step 6.4: Commit**

```bash
git add src/BorgDock.Tauri/src/components/sql/SqlApp.tsx
git commit -m "refactor(sql): migrate status bar to shared chrome primitive"
```

---

## Task 7: Migrate PR detail tabs to `Tabs` primitive

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/pr-detail/PRDetailPanel.tsx:17-18, 55-89, 197-223`
- Modify: `src/BorgDock.Tauri/src/components/pr-detail/__tests__/PRDetailPanel.test.tsx`

The existing tab bar at `PRDetailPanel.tsx:197-223` is a manual `tabs.map()` rendering buttons with an absolutely-positioned animated underline driven by `tabsRef` + `setUnderline`. The `Tabs` primitive (PR #1) covers every behavior via CSS (`.bd-tab--active::after` is the underline) — so the `tabsRef`, `underline` state, and `useEffect` that measures offsets all go away.

- [ ] **Step 7.1: Rewrite the tab bar in `PRDetailPanel.tsx`**

In `src/BorgDock.Tauri/src/components/pr-detail/PRDetailPanel.tsx`:

**Change A** — imports: add the primitives import after the existing chrome import:

```tsx
import { Tabs } from '@/components/shared/primitives';
import type { TabDef } from '@/components/shared/primitives';
```

**Change B** — `tabs` constant at line 17-18: keep the tuple for type narrowing but add a parallel `TabDef[]` for the primitive:

```tsx
const tabs = ['Overview', 'Commits', 'Files', 'Checks', 'Reviews', 'Comments'] as const;
type Tab = (typeof tabs)[number];

const tabDefs: TabDef[] = tabs.map((id) => ({ id, label: id }));
```

**Change C** — delete the `tabsRef` + `underline` state and the underline-measuring `useEffect`. Remove these lines entirely (currently lines 57-58 and 83-89):

```tsx
// DELETE THESE:
const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
const [underline, setUnderline] = useState({ left: 0, width: 0 });
```

```tsx
// DELETE THIS useEffect ENTIRELY:
useEffect(() => {
  const idx = tabs.indexOf(activeTab);
  const el = tabsRef.current[idx];
  if (el) {
    setUnderline({ left: el.offsetLeft, width: el.offsetWidth });
  }
}, [activeTab]);
```

Also remove the now-unused `useRef` from the `useState, useRef, useEffect, useCallback` import destructure (if it only appeared for `tabsRef`). If `useRef` is used elsewhere in the file, leave it.

**Change D** — replace the tab bar JSX (currently lines 197-223):

```tsx
      {/* Tab bar */}
      <Tabs
        value={activeTab}
        onChange={(id) => setActiveTab(id as Tab)}
        tabs={tabDefs}
        className="px-3"
      />
```

Remove the redundant `clsx` import if `PRDetailPanel.tsx` no longer uses it (a subsequent ESLint run will flag this — delete the import line then).

- [ ] **Step 7.2: Update `PRDetailPanel.test.tsx`**

Open `src/BorgDock.Tauri/src/components/pr-detail/__tests__/PRDetailPanel.test.tsx`. Any assertion that queries tabs by the old class markup (`.text-[var(--color-tab-active)]`, the absolute underline div, etc.) must migrate to the new Tabs primitive DOM.

Common fixes:
- Tab buttons now have `role="tab"` and `aria-selected` — query with `screen.getAllByRole('tab')` and assert `aria-selected="true"` for the active one.
- The animated underline is now a CSS `::after` pseudo-element, not a measurable DOM node — remove any assertion that queries the underline div's `style.left` / `style.width`.

Re-read the test file, then update the assertions accordingly. Do not weaken coverage — the contract to preserve is:

1. All six tab labels render.
2. Clicking a tab changes which tab body renders.
3. The default active tab is Overview.

If the existing test covers these via different queries, update those queries; don't delete the tests.

- [ ] **Step 7.3: Run PR detail tests**

```bash
cd src/BorgDock.Tauri
npm test -- --run src/components/pr-detail
```

Expected: all pass. Iterate until green.

- [ ] **Step 7.4: Run pr-detail e2e spec**

```bash
cd src/BorgDock.Tauri
npm run test:e2e -- tests/e2e/pr-detail.spec.ts --project webview-mac
```

Expected: behavioral assertions (tab bar shows Overview / Commits / Files / Checks / Reviews, clicking tabs switches content, overview tab shows action buttons) all pass. The specs should be selector-agnostic (role-based); if any break on a class selector, fix the selector in the spec to `role="tab"`.

- [ ] **Step 7.5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/pr-detail/
git commit -m "refactor(pr-detail): migrate tab bar to Tabs primitive"
```

---

## Task 8: Migrate Header section switcher to `Tabs` primitive

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/layout/Header.tsx:20-25, 83-103`
- Modify: `src/BorgDock.Tauri/src/components/layout/__tests__/Header.test.tsx`

The Focus / PRs / Work Items section switcher is a segmented-control-style button group today (`.sidebar-section-btn--active` uses a surface-raised background). The spec §5 lists "Tabs primitive — Replaces: Section tabs …", so this migrates to the tab-bar-with-underline visual. **This is a deliberate visual change** — the mockups show a single unified tab vocabulary across the app.

The Focus tab's unread count badge is rendered by both `FeatureBadge` ("new feature" discoverability) and a numeric focus count. The numeric count maps onto `TabDef.count`; the `FeatureBadge` (discoverability sticker) stays as a separate sibling element outside the Tabs primitive — it's not a tab-primitive concern.

- [ ] **Step 8.1: Rewrite the section switcher in `Header.tsx`**

Edit `src/BorgDock.Tauri/src/components/layout/Header.tsx`:

**Change A** — imports: add the primitives import near the top (beside `FeatureBadge`):

```tsx
import { Tabs } from '@/components/shared/primitives';
import type { TabDef } from '@/components/shared/primitives';
```

**Change B** — the `sections` constant (line 21-25) stays, but we also derive `tabDefs` inline inside the component.

**Change C** — replace the section switcher JSX (lines 83-103) with:

```tsx
      {/* Center: Section switcher */}
      <div className="sidebar-section-switcher relative">
        <Tabs
          value={activeSection}
          onChange={(id) => setActiveSection(id as ActiveSection)}
          tabs={sections.map<TabDef>((s) => ({
            id: s.key,
            label: s.label,
            count: s.key === 'focus' && focusCount > 0 ? focusCount : undefined,
          }))}
          dense
        />
        <FeatureBadge badgeId="focus-mode" className="absolute -right-1 -top-1 pointer-events-none" />
      </div>
```

**Change D** — `FeatureBadge` may not accept `className` today. Open `src/BorgDock.Tauri/src/components/onboarding/FeatureBadge.tsx` and confirm. If the prop doesn't exist, position the badge via a wrapper `<span>`:

```tsx
      {/* Center: Section switcher */}
      <div className="sidebar-section-switcher relative">
        <Tabs
          value={activeSection}
          onChange={(id) => setActiveSection(id as ActiveSection)}
          tabs={sections.map<TabDef>((s) => ({
            id: s.key,
            label: s.label,
            count: s.key === 'focus' && focusCount > 0 ? focusCount : undefined,
          }))}
          dense
        />
        <span className="pointer-events-none absolute -right-1 -top-1">
          <FeatureBadge badgeId="focus-mode" />
        </span>
      </div>
```

Use whichever form compiles — prefer the first if `FeatureBadge` takes `className`.

- [ ] **Step 8.2: Keep or remove `.sidebar-section-switcher` container CSS**

The container class `.sidebar-section-switcher` (line 1040 in index.css) currently styles the segmented-control outer wrapper (background, border-radius, 1px gap). With the new Tabs primitive, that wrapper styling is no longer needed — the `bd-tabs` class applies its own border-bottom. Delete the `.sidebar-section-switcher` style rule (lines ~1038-1045 in `index.css`, look for the `gap: 1px; background: var(--color-filter-chip-bg);` rule) along with `.sidebar-section-btn*` in Task 9. In the JSX, keep the className for now since it may be targeted by e2e specs — it becomes a no-op but harmless locator.

- [ ] **Step 8.3: Update `Header.test.tsx`**

Open `src/BorgDock.Tauri/src/components/layout/__tests__/Header.test.tsx`. Any assertion against `.sidebar-section-btn--active` now fails — the active-tab indicator is `aria-selected="true"` on the tab button.

Preserve the contract:
1. Three sections render (Focus, PRs, Work Items).
2. Clicking a section calls `setActiveSection` with the right key.
3. The active section is visually distinguished.
4. The focus count badge renders when `focusCount > 0`.

Migrate queries to `screen.getAllByRole('tab')` / `toHaveAttribute('aria-selected', 'true')`.

- [ ] **Step 8.4: Run layout tests**

```bash
cd src/BorgDock.Tauri
npm test -- --run src/components/layout
```

Expected: all pass.

- [ ] **Step 8.5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/layout/
git commit -m "refactor(layout): migrate Header section switcher to Tabs primitive"
```

---

## Task 9: Delete legacy CSS classes

**Files:**
- Modify: `src/BorgDock.Tauri/src/styles/index.css`

All consumers of `.window-titlebar*`, `.window-ctrl-btn*`, `.sidebar-section-btn*`, and `.sql-status-bar` have migrated (Tasks 2, 3, 6, 8). Delete the now-unused rules. Do this in one sweep to keep the commit atomic.

- [ ] **Step 9.1: Verify no remaining consumers**

Before deleting, grep for each class to confirm zero consumers remain:

```bash
cd src/BorgDock.Tauri
grep -rn "window-titlebar" src/ --include="*.tsx" --include="*.ts" --include="*.jsx"
grep -rn "window-ctrl-btn\|window-ctrl-group" src/ --include="*.tsx" --include="*.ts"
grep -rn "sidebar-section-btn" src/ --include="*.tsx" --include="*.ts"
grep -rn "\.sql-status-bar" src/ --include="*.tsx" --include="*.ts"
```

Expected: each grep returns only matches inside test files that predate the migration (if any still reference legacy classes, go back and update them — the grep should ultimately return zero matches outside of `.css` files). If a test file references one, fix the test's selector to the new DOM.

- [ ] **Step 9.2: Delete the `.window-titlebar*` block**

Open `src/BorgDock.Tauri/src/styles/index.css`. Delete lines 1795-1846 (everything from the `/* Custom Window Title Bar (chromeless windows) */` comment through the `.window-titlebar-btn--close:hover` block, inclusive).

- [ ] **Step 9.3: Delete the `.window-ctrl-group` + `.window-ctrl-btn*` block**

Delete lines 1880-1925 — everything from the `/* Native-style min/max/close cluster for chromeless windows. */` comment through the `.window-ctrl-btn--close:active:not(:disabled)` block, inclusive.

- [ ] **Step 9.4: Delete the `.sidebar-section-btn*` + `.sidebar-section-switcher` block**

Delete lines 1038-1071 — the `.sidebar-section-switcher` container (if present in that line range) through `.sidebar-section-btn--active`. Verify by searching for `sidebar-section` after the delete: only `.sidebar-header-left`, `.sidebar-header-right`, `.sidebar-status-dot*` should remain (those are separate sidebar chrome, not the section switcher).

- [ ] **Step 9.5: Delete the `.sql-status-bar` block (only the bar — keep content helpers)**

Delete ONLY the `.sql-status-bar { … }` rule (lines 2264-2274). **Keep** `.sql-status-left`, `.sql-status-rows`, `.sql-status-truncated`, `.sql-status-dot`, `.sql-status-time`, `.sql-status-selected`, `.sql-status-right`, `.sql-copy-flash`, `.sql-copy-group`, `.sql-copy-btn`, and the `sql-flash-in` keyframe — those style the *content* of the status bar and are still used by `sql/SqlApp.tsx` after Task 6.

- [ ] **Step 9.6: Run the full test suite**

```bash
cd src/BorgDock.Tauri
npm test
```

Expected: all Vitest suites pass.

- [ ] **Step 9.7: Commit**

```bash
git add src/BorgDock.Tauri/src/styles/index.css
git commit -m "chore(styles): delete legacy titlebar / ctrl-btn / section-btn / status-bar classes"
```

---

## Task 10: Full regression sweep (behavioral + visual + a11y + motion)

**Files:** none modified unless regressions surface.

Every acceptance criterion in the spec §8 PR #2 row must be green before handoff. The spec also requires:

- Visual regression tests for titlebar chrome / tab bars / status bars should flip green.
- Behavioral e2e specs from PR #0 must keep passing.

Run everything. Fix any regression by going back to the task that introduced it.

- [ ] **Step 10.1: Full Vitest sweep**

```bash
cd src/BorgDock.Tauri
npm test
```

Expected: all pass.

- [ ] **Step 10.2: Behavioral e2e — mac project**

```bash
cd src/BorgDock.Tauri
npm run test:e2e -- --project webview-mac --grep -v "visual|motion"
```

Expected: all behavioral specs pass — pr-list, pr-detail, pr-context-menu, settings, wizard, theme, keyboard-nav, notifications, work-items, window-rendering, tray-first, flyout, focus, file-palette, file-viewer, command-palette, sql, worktree-palette, diff-viewer, whats-new.

If a spec fails on a selector that changed with the chrome migration (e.g. `.window-titlebar-btn` → now a `role="button"` inside a `.bd-wc-group`), the fix depends on the spec's intent:
- If the spec is asserting user-facing behavior (the button exists and is clickable), update the selector to role-based.
- If the spec is asserting implementation detail (a specific class exists), reconsider whether the test should be asserting that at all; prefer role-based.

Do not skip a failing spec. If one fails and the fix isn't obvious, stop and diagnose.

- [ ] **Step 10.3: Visual regression — mac project**

```bash
cd src/BorgDock.Tauri
npm run test:e2e -- tests/e2e/visual.spec.ts --project webview-mac
```

Expected: **baselines for migrated surfaces should flip green**. Specifically the `pr-detail-tabs-*.png` and `focus-tab-*.png` (section switcher) baselines should match within tolerance now that the surfaces use primitives.

Titlebar and status-bar baselines (if they exist) should also move toward green. If a baseline is still red after migration, investigate pixel parity:
1. Run `npm run test:e2e -- tests/e2e/visual.spec.ts --project webview-mac --update-snapshots` only if you're **certain** the new rendering matches the design PNG (check the diff image in `test-results/`). Never auto-accept a baseline without a human eyeball on the diff.
2. More often: inline style overrides, stray inline colors, or missing tokens cause residual drift. The `bd-*` classes in `@layer components` are already calibrated; residual drift is almost always an inline-style or structural issue in the consumer.

Baselines for surfaces **not** touched by PR #2 (pr-list, flyout, focus, etc.) may still be red — those are PR #3+'s work. Confirm the red baselines are NOT the ones in scope for this PR.

- [ ] **Step 10.4: Accessibility — mac project**

```bash
cd src/BorgDock.Tauri
npm run test:e2e -- --project webview-mac --grep a11y
```

Expected: axe analysis passes on every surface this PR touched. If a new violation appears (e.g. missing aria-label on `WindowControls` → already covered; missing role on `Tabs` → already `role="tab"`), fix it in the primitive and re-test.

- [ ] **Step 10.5: Motion — mac project**

```bash
cd src/BorgDock.Tauri
npm run test:e2e -- tests/e2e/motion.spec.ts --project webview-mac
```

Expected: `button press scale`, `tab underline animates across 200ms` assertions pass. The Tabs primitive already has the transition (`.bd-tab--active::after` animates `left` / `right` via the default `.bd-tabs` layout — confirm in `index.css` around line 2694-2704). If it doesn't animate, that's a PR #1 bug to fix now.

- [ ] **Step 10.6: Windows runner parity**

```bash
cd src/BorgDock.Tauri
npm run test:e2e -- --project webview-win
```

If running on macOS locally, this skips with "project not available" — that's fine; the CI `.github/workflows/test.yml` runs it. But if you're on Windows, this must be green too.

- [ ] **Step 10.7: Type check + lint**

```bash
cd src/BorgDock.Tauri
npm run build
```

Expected: TypeScript emits zero errors, Vite bundles, no ESLint failures.

- [ ] **Step 10.8: Commit (if any regressions required fixes)**

If Steps 10.1-10.7 required follow-up fixes, commit them as:

```bash
git add <files>
git commit -m "fix(chrome): address regressions from chrome migration"
```

If everything was green on first pass, skip this step.

---

## Task 11: Update the spec Delivery Ledger

**Files:**
- Modify: `docs/superpowers/specs/2026-04-24-shared-components-design.md`

The spec's §9 living spec ritual mandates the PR's final commit updates the Delivery Ledger row. Transition PR #2 from `Planned` to `In review`.

- [ ] **Step 11.1: Update the ledger row**

Open `docs/superpowers/specs/2026-04-24-shared-components-design.md`. Find the Delivery Ledger table in §9.1. Replace the `#2` row:

Before:
```markdown
| #2 | `feat/streamline-02-chrome` | Planned | — | — | — |
```

After:
```markdown
| #2 | `feat/streamline-02-chrome` | In review | — | — | WindowControls + StatusBar chrome primitives landed; tab bars (PR detail, section switcher) migrated; legacy window-titlebar / window-ctrl-btn / sidebar-section-btn / sql-status-bar classes deleted. Review/Settings/Focus sub-tabs do not exist in code today — deferred to feature PRs (#3/#4/#6). |
```

- [ ] **Step 11.2: Commit**

```bash
git add docs/superpowers/specs/2026-04-24-shared-components-design.md
git commit -m "docs(spec): mark PR #2 as in review"
```

---

## Task 12: Push and open PR

**Files:** none.

- [ ] **Step 12.1: Push the branch**

```bash
git push -u origin feat/streamline-02-chrome
```

- [ ] **Step 12.2: Switch gh to the borght-dev account**

The repo is personal (`borght-dev/BorgDock`), so PRs open from the personal account:

```bash
gh auth switch --user borght-dev
gh auth status | head -5
# Expected: "Active account: true" under borght-dev
```

- [ ] **Step 12.3: Open the PR against `feat/streamline-01-foundation`**

```bash
gh pr create \
  --base feat/streamline-01-foundation \
  --head feat/streamline-02-chrome \
  --title "feat(streamline): PR #2 — chrome (titlebar, status bar, tabs vocabulary)" \
  --body "$(cat <<'EOF'
## Summary

PR #2 of the BorgDock streamline stack. Migrates every window chrome surface onto the primitives landed in PR #1.

- Adds `WindowControls` + `StatusBar` composed-chrome components under `components/shared/chrome/`.
- Rewrites `shared/WindowTitleBar.tsx` on top of `Titlebar` + `WindowControls`.
- Migrates PR detail tabs (Overview/Commits/Files/Checks/Reviews/Comments) and the Header section switcher (Focus/PRs/Work Items) to the `Tabs` primitive.
- Migrates `layout/StatusBar` and the SQL window's status bar to the shared chrome `StatusBar`.
- Deletes legacy `.window-titlebar*`, `.window-ctrl-btn*`, `.sidebar-section-btn*`, `.sql-status-bar` CSS.

**Stacked on:** `feat/streamline-01-foundation` (PR #1). Merge after PR #1.

**Not in scope:** review / settings / focus sub-tabs don't exist in code today. The spec's §8 PR #2 row mentions them, but those are additions that belong in their feature redesign PRs (#3 / #4 / #6). Spec §3 non-goal "Redesigning features beyond what the mockups specify" keeps us honest.

## Test plan

- [ ] `npm test` passes (full Vitest suite).
- [ ] `npm run test:e2e -- --project webview-mac` passes (behavioral + visual + a11y + motion).
- [ ] `npm run test:e2e -- --project webview-win` passes in CI.
- [ ] `pr-detail-tabs-*.png` + `focus-tab-*.png` visual baselines flip green.
- [ ] Spec Delivery Ledger row #2 reads "In review".

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 12.4: Switch gh back to the enterprise account**

Per CLAUDE.md: leaving the active account as `borght-dev` is the bug — work contexts assume enterprise.

```bash
gh auth switch --user KvanderBorght_gomocha
gh auth status | head -5
# Expected: "Active account: true" under KvanderBorght_gomocha
```

- [ ] **Step 12.5: Report PR URL to user**

Output the PR URL so the user can see it.

---

## Self-Review Checklist

Run through this yourself before handoff:

- [ ] **Spec coverage:** Every acceptance criterion in spec §8 PR #2 row has a task: WindowTitleBar rewrite (Task 2), StatusBar creation + migrations (Tasks 4-6), Tab bars swap (Tasks 7-8), legacy CSS deleted (Task 9). Review/settings/focus subtabs explicitly called out as out-of-scope.
- [ ] **No placeholders:** every code block shows the actual code, not TODOs. Every step has concrete commands. No "similar to X" — each task is self-contained.
- [ ] **Type consistency:** `TabDef` imported from `@/components/shared/primitives` in Tasks 7 + 8. `WindowControls` / `StatusBar` imported from `@/components/shared/chrome` in Tasks 2, 3, 5, 6. Props match: `WindowControlsProps` (`onMinimize`, `onMaximize`, `onClose`, `className`), `StatusBarProps` (`left`, `right`, `className`, extends `HTMLAttributes<HTMLDivElement>`).
- [ ] **Frequent commits:** 12 commits across 12 tasks. Each commit is atomic — primitive creation, consumer migration, CSS cleanup, spec update — so revert is surgical if something regresses.
- [ ] **TDD:** Tasks 1 + 4 (new primitives) follow test-first. Tasks 2, 7, 8 (migrations of tested components) update tests to reflect new DOM before implementing.

---
