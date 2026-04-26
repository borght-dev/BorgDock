# BorgDock Streamline PR #9 — Visual Surface URL Routing

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Wire URL deep-links (`?section=`/`?settings=`/`?wizard=`/`?toast=`) so `visual.spec.ts` can capture per-surface screenshots that actually reflect the target view, instead of always landing on the default sidebar.

**Architecture:** Test-only routing additions guarded by `import.meta.env.DEV` so production navigation is unaffected. Each route reads `URLSearchParams` once on mount and dispatches via the existing store API.

**Tech Stack:** React + Zustand + Vite env guards.

**Stack position:** Branched from whatever the live tip of the streamline stack is (likely `feat/streamline-08-test-infra` or `master` if the stack has been merged). PR #9 stacks on PR #8.

---

## File Structure

Touched (production):
- `src/BorgDock.Tauri/src/components/layout/App.tsx` — read `?settings=open` and `?wizard=force` on mount.
- `src/BorgDock.Tauri/src/components/layout/Header.tsx` — read `?section=` on mount and dispatch the section change.
- `src/BorgDock.Tauri/src/components/wizard/SetupWizard.tsx` — honor `?wizard=force` even when `setupComplete=true`.
- `src/BorgDock.Tauri/src/components/notifications/NotificationManager.tsx` — emit a synthetic test toast on `?toast=test`.

Touched (tests):
- `src/BorgDock.Tauri/tests/e2e/visual.spec.ts` — set `path` per affected surface and tighten `ready`/`clipTo` to surface-specific selectors.

## Tasks

### Task 1: `?section=` route

- [ ] Read `URLSearchParams` once in `Header.tsx` on mount; if `section` is `focus|prs|work-items`, call the existing section store's setter.
- [ ] Update `visual.spec.ts` SURFACES: `focus-tab` → `path: '/?section=focus'`, `ready: '[data-section="focus"]'`; `work-items` → `path: '/?section=work-items'`, `ready: '[data-section="work-items"]'`.
- [ ] Run `npx playwright test visual.spec.ts:focus-tab visual.spec.ts:work-items` and confirm the right section mounts.
- [ ] Commit.

### Task 2: `?settings=open` route

- [ ] In `App.tsx`, read `URLSearchParams` on mount; if `settings === 'open'`, call the settings flyout store's `open()`.
- [ ] Update `visual.spec.ts` SURFACES: `settings` → `path: '/?settings=open'`, `ready: '[data-flyout="settings"]'`.
- [ ] Run + commit.

### Task 3: `?wizard=force` route

- [ ] In `App.tsx`'s wizard gate, treat `URLSearchParams.get('wizard') === 'force'` as equivalent to `!setupComplete` — but ONLY when `import.meta.env.DEV || (window as any).__PLAYWRIGHT__`.
- [ ] Update `visual.spec.ts` SURFACES: `wizard` → `path: '/?wizard=force'`, `ready: '[data-wizard-step]'`.
- [ ] Run + commit.

### Task 4: `?toast=test` route

- [ ] In `NotificationManager.tsx`, on mount check `URLSearchParams.get('toast') === 'test'`. If true, push a synthetic toast via the existing notifications store.
- [ ] Update `visual.spec.ts` SURFACES: `toasts` → `path: '/?toast=test'`, `ready: '[data-toast]'`.
- [ ] Run + commit.

### Task 5: Update Delivery Ledger §9.1

- [ ] Mark PR #9 as `In review`, with merge SHA / date / notes.
- [ ] Open PR via `borght-dev` account.

## Constraints

- All routes are dev/test only — guard with `import.meta.env.DEV` or a `__PLAYWRIGHT__` flag.
- Don't touch the existing section store / flyout store / setup gate's interface — only consume them.
- Visual baselines remain red by design — that's the progress signal, not a blocker.
