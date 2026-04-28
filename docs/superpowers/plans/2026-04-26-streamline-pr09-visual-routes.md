# BorgDock Streamline PR #9 — Visual Surface URL Routing

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire dev/test-only URL deep-links (`?section=`/`?settings=open`/`?wizard=force`/`?toast=test`) so `tests/e2e/visual.spec.ts` mounts each per-surface screenshot on the actual target view instead of the default sidebar landing.

**Architecture:** Each surface reads `URLSearchParams` once on mount inside the existing React component that owns that surface and dispatches via the existing Zustand store API (`useUiStore.setSettingsOpen`, `useUiStore.setActiveSection`, `useNotificationStore.show`). Wizard force-render extends the existing `App.tsx` `needsSetup` gate. All four routes are guarded with `import.meta.env.DEV || window.__PLAYWRIGHT__` so production navigation is unchanged. The `__PLAYWRIGHT__` flag is set by the existing `injectCompletedSetup` Playwright helper so prod bundles never see it.

**Tech Stack:** React 18 + Zustand + Vite env guards + Playwright. No new dependencies.

**Stack position:** Branched from `feat/streamline-08-test-infra` (PR #8 HEAD: `26e74679`). PR #9 stacks on PR #8 and opens against it; PR #8 will rebase onto `master` once PRs #0–#7 land.

**Worktree:** `~/projects/borgdock-streamline-09` (already created via `git worktree add`).

**Branch:** `feat/streamline-09-visual-routes` (already created).

---

## Baseline (PR #8 contract — must hold in -09 before any feature work)

| Suite | Result |
|---|---|
| `npm test -- --run` (vitest) | **2663 pass / 0 fail** |
| `cargo test --lib` (in `src-tauri`) | **73 pass / 0 fail** |
| Playwright historic 5-spec batch (`worktree-palette worktree-changes file-palette file-viewer diff-viewer`) | **18 pass / 7 fail** (5 a11y + 1 `getCurrentWindow().close()` sim limit + 1 prune-flow aspirational gap — all infra-deferred) |

If any of those numbers don't match in -09 before Task 1, **STOP and root-cause** before proceeding — every PR-#9 task assumes a clean baseline.

---

## File Structure

**Touched (production source — frontend only, no Rust):**

| File | Change |
|---|---|
| `src/BorgDock.Tauri/src/App.tsx` | Read `?settings=open` + `?wizard=force` once on mount; extend `needsSetup` gate with dev/test-guarded wizard force flag. |
| `src/BorgDock.Tauri/src/components/layout/Header.tsx` | Read `?section=` once on mount; dispatch via existing `useUiStore.setActiveSection`. |
| `src/BorgDock.Tauri/src/components/layout/Sidebar.tsx` | Add `data-section={activeSection}` attribute to the section content wrapper so `visual.spec.ts` has a stable per-section ready-selector. |
| `src/BorgDock.Tauri/src/components/notifications/NotificationOverlay.tsx` | Read `?toast=test` once on mount; push synthetic toast via existing `useNotificationStore.show`. |

**Touched (tests):**

| File | Change |
|---|---|
| `src/BorgDock.Tauri/tests/e2e/helpers/test-utils.ts` | Extend `injectCompletedSetup` to set `window.__PLAYWRIGHT__ = true` so dev/test guards fire on prod-mode test runs. |
| `src/BorgDock.Tauri/tests/e2e/visual.spec.ts` | Tighten `path` + `ready` for `focus-tab`, `work-items`, `settings`, `wizard`, `toasts`. Update `flyout` `note` to remove the "follow-up" hedge per the deliberate decision in Task 9. |

**Touched (spec):**

| File | Change |
|---|---|
| `docs/superpowers/specs/2026-04-24-shared-components-design.md` | Update §9.1 row for PR #9: flip `Planned → In review` with date/notes/PR URL. |

---

## Notes about the existing code (read before starting)

- `useUiStore.setActiveSection(section: 'focus' | 'prs' | 'workitems')` exists at `src/stores/ui-store.ts:56-61` and persists to `ui-state.json` via `persistToTauriStore`. It also sets `_hasUserNavigated = true`, which means `restorePersistedSection` (called in `App.tsx:170-173`) will not overwrite the URL-driven section after mount. Good — no extra coordination needed.
- `useUiStore.setSettingsOpen(open: boolean)` exists at `src/stores/ui-store.ts:54`. `<SettingsFlyout />` is unconditionally rendered from `App.tsx:288` and shows when `isSettingsOpen === true`. The flyout has `data-flyout="settings"` at `src/components/settings/SettingsFlyout.tsx:94` already.
- `useNotificationStore.show(notification: InAppNotification)` exists at `src/stores/notification-store.ts:36-50`. `<NotificationOverlay />` is unconditionally rendered from `App.tsx:289` and emits `<NotificationBubble data-toast …>` (already at `src/components/notifications/NotificationBubble.tsx:132`).
- `App.tsx:76-79` has the `needsSetup` gate; the wizard returns at line 246-248. The dev/test guard must short-circuit BEFORE that block so the wizard renders even when `setupComplete=true`.
- `installTestSeed` at `src/test-support/test-seed.ts:61` is gated by `import.meta.env.DEV` and exposes `window.__borgdock_test_toast`. Don't reuse this — Task 8 must work even in prod-mode test runs (when `import.meta.env.DEV` is false). Use `__PLAYWRIGHT__` as the prod-mode escape hatch.
- The `dev/test guard` is `import.meta.env.DEV || (typeof window !== 'undefined' && (window as { __PLAYWRIGHT__?: boolean }).__PLAYWRIGHT__)`. Define it once as a small helper or inline; both are fine. **Never** ship without the guard — production bundles must not honor these query params.
- Playwright runs `vite preview` (prod build) per `playwright.config.ts`, so `import.meta.env.DEV === false` at e2e runtime. That's why `__PLAYWRIGHT__` is required: dev-mode-only test seeds (`installTestSeed`) work today only because Vite tree-shakes their bodies under prod, leaving the e2e harness dependent on injected globals to drive the app.
- The `flyout` surface (`tests/e2e/visual.spec.ts:71-76`) has a `note` ending in "until the attribute is added in a follow-up PR." The follow-up is **this** PR. Decide explicitly in Task 9 whether to add `data-tauri-drag-region` to FlyoutGlance/FlyoutInitializing or leave the body fallback as the permanent shape (the flyout is a floating card, not a windowed app — `data-tauri-drag-region` only makes semantic sense when the surface acts as a movable window). Whichever path you pick, **delete the "follow-up" hedge from the note**.
- `settings.spec.ts:11` ("clicking settings icon opens the flyout") was failing pre-PR-#8. Root-cause is bundled into Task 5 because `?settings=open` exercises the same code path: if the click → `setSettingsOpen(true)` → `data-flyout="settings"` chain is broken, both fail.

---

## Tasks

### Task 1 — Confirm baseline in -09

**Files:** none (verification only).

- [ ] **Step 1: Confirm vitest baseline**

  Run from `~/projects/borgdock-streamline-09/src/BorgDock.Tauri`:

  ```bash
  npm test -- --run 2>&1 | tail -25
  ```

  Expected: `Test Files  N passed (N) | Tests  2663 passed (2663)`.

  If the count differs by more than ±1 (a flaky test margin), STOP. Report the deviation before continuing.

- [ ] **Step 2: Confirm cargo lib baseline**

  Run from `~/projects/borgdock-streamline-09/src/BorgDock.Tauri/src-tauri`:

  ```bash
  cargo test --lib 2>&1 | tail -15
  ```

  Expected: `test result: ok. 73 passed; 0 failed`.

  If 0 failed but the pass count differs, STOP and report.

- [ ] **Step 3: Confirm historic Playwright 5-spec batch**

  Run from `~/projects/borgdock-streamline-09/src/BorgDock.Tauri`:

  ```bash
  npx playwright test \
    tests/e2e/worktree-palette.spec.ts \
    tests/e2e/worktree-changes.spec.ts \
    tests/e2e/file-palette.spec.ts \
    tests/e2e/file-viewer.spec.ts \
    tests/e2e/diff-viewer.spec.ts \
    --reporter=line 2>&1 | tail -30
  ```

  Expected: `18 passed`, `7 failed`. The 7 expected fails are infra-deferred (5 a11y color-contrast in chromeless windows, 1 `file-palette escape closes palette` (`getCurrentWindow().close()` browser sim limit), 1 `worktree-palette prune action opens confirm dialog` aspirational gap).

  If the failure shape differs (different specs failing, or pass count regressed), STOP and report. **Do not commit** — verification only.

- [ ] **Step 4: Record baseline**

  No code change. Move to Task 2.

---

### Task 2 — Add `data-section` attribute to Sidebar

The visual spec needs a stable selector to assert which section mounted. Today `Sidebar.tsx` swaps content based on `activeSection` but exposes no surface-readable signal.

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/layout/Sidebar.tsx:31-37` (the `<div className="sidebar-content">…</div>` wrapper).

- [ ] **Step 1: Add the attribute**

  Edit `src/BorgDock.Tauri/src/components/layout/Sidebar.tsx`. Replace the `<div className="sidebar-content">` opening tag with:

  ```tsx
  <div className="sidebar-content" data-section={activeSection}>
  ```

  Map the store value → DOM selector value as-is (`prs` / `focus` / `workitems`). The visual.spec.ts SURFACES we add in later tasks will use these exact keys.

- [ ] **Step 2: Verify build still type-checks**

  ```bash
  cd src/BorgDock.Tauri && npx tsc --noEmit 2>&1 | grep -E "Sidebar.tsx|error TS" | head -10
  ```

  Expected: no errors mentioning `Sidebar.tsx`. (Other files may have pre-existing strictness errors carried over from earlier PRs — leave those alone.)

- [ ] **Step 3: Quick sanity render check**

  ```bash
  cd src/BorgDock.Tauri && npm test -- --run src/components/layout 2>&1 | tail -10
  ```

  Expected: any layout-folder tests still pass (Sidebar has no dedicated test, but Header tests live nearby and shouldn't regress).

- [ ] **Step 4: Commit**

  ```bash
  git add src/BorgDock.Tauri/src/components/layout/Sidebar.tsx
  git commit -m "test(layout): expose data-section on sidebar content for visual.spec.ts"
  ```

---

### Task 3 — Wire `?section=` route in Header

Reads `URLSearchParams` once on mount; dispatches via the existing section-store action when the param matches one of the three section keys. The `setActiveSection` setter sets `_hasUserNavigated = true` (see `src/stores/ui-store.ts:57`), so the persisted-section restore in `App.tsx:170-173` will NOT overwrite the URL-driven choice.

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/layout/Header.tsx` (add import for `useEffect`; add a single mount-effect inside `Header()`).

- [ ] **Step 1: Add the mount effect**

  Edit `src/BorgDock.Tauri/src/components/layout/Header.tsx`. Update the React import line at the top to include `useEffect`:

  ```tsx
  import { useCallback, useEffect } from 'react';
  ```

  Inside the `Header()` body, after the existing `setActiveSection` selector (line 31) and before the `setSettingsOpen` selector (line 32), insert:

  ```tsx
  // Dev/test-only deep-link: ?section=focus|prs|work-items dispatches the
  // existing section-store action on mount so visual.spec.ts can land on
  // the right surface without simulating a click. Production navigation
  // is unaffected — neither import.meta.env.DEV nor __PLAYWRIGHT__ is true
  // in shipped builds.
  useEffect(() => {
    const isTest =
      import.meta.env.DEV ||
      (typeof window !== 'undefined' &&
        (window as { __PLAYWRIGHT__?: boolean }).__PLAYWRIGHT__ === true);
    if (!isTest) return;
    const param = new URLSearchParams(window.location.search).get('section');
    if (!param) return;
    const map: Record<string, ActiveSection> = {
      focus: 'focus',
      prs: 'prs',
      'work-items': 'workitems',
    };
    const target = map[param];
    if (target) setActiveSection(target);
    // Run once on mount; subsequent in-app navigation is user-driven.
  }, [setActiveSection]);
  ```

  Note the URL key is `work-items` (kebab-case, matching the SURFACES `id` in visual.spec.ts) but the store value is `workitems` (no separator, matching the existing `ActiveSection` union at `src/stores/ui-store.ts:5`).

- [ ] **Step 2: Verify type-check**

  ```bash
  cd src/BorgDock.Tauri && npx tsc --noEmit 2>&1 | grep -E "Header.tsx|error TS" | head -10
  ```

  Expected: no errors mentioning `Header.tsx`.

- [ ] **Step 3: Run vitest**

  ```bash
  cd src/BorgDock.Tauri && npm test -- --run 2>&1 | tail -15
  ```

  Expected: 2663 pass (no regression). The new mount effect doesn't fire under jsdom because `window.location.search` is empty.

- [ ] **Step 4: Commit**

  ```bash
  git add src/BorgDock.Tauri/src/components/layout/Header.tsx
  git commit -m "feat(test-routing): honor ?section= deep-link in Header (dev/test-only)"
  ```

---

### Task 4 — Update `visual.spec.ts` SURFACES for `focus-tab` and `work-items`

**Files:**
- Modify: `src/BorgDock.Tauri/tests/e2e/visual.spec.ts:91-108` (the `focus-tab` and `work-items` entries inside `SURFACES`).

- [ ] **Step 1: Update `focus-tab` entry**

  Replace lines 91-96 (the `focus-tab` entry):

  ```ts
    // ② focus
    {
      id: 'focus-tab',
      path: '/?section=focus',
      ready: '[data-section="focus"]',
      note: 'Main window with Focus section forced via ?section=focus URL deep-link (PR #9). Header reads URLSearchParams on mount and dispatches setActiveSection.',
    },
  ```

- [ ] **Step 2: Update `work-items` entry**

  Replace the `work-items` entry (lines 104-108):

  ```ts
    {
      id: 'work-items',
      path: '/?section=work-items',
      ready: '[data-section="workitems"]',
      note: 'Main window with Work Items section forced via ?section=work-items URL deep-link (PR #9). Note: URL param is kebab-case, store value is concatenated.',
    },
  ```

- [ ] **Step 3: Run the two surface tests** (skip if Task 6 hasn't landed yet)

  Use `vite preview` against the prod build (Playwright config will spin this up automatically). Run only the two affected tests:

  ```bash
  cd src/BorgDock.Tauri && npx playwright test tests/e2e/visual.spec.ts \
    -g "focus-tab|work-items" \
    --reporter=line 2>&1 | tail -25
  ```

  Expected: each test mounts the right section. Pixel diffs will still be RED (visual baselines remain pending the design migration — `tests/e2e/visual.spec.ts:17-22` calls this out). The signal we want is that the tests **don't fail with `locator not found` or `timeout waiting for [data-section=…]`** — they fail with pixel-diff errors only.

  If the test fails on the locator: confirm `__PLAYWRIGHT__` is being injected (Task 6 handles that — Task 6 may need to land BEFORE this step's verification can succeed).

- [ ] **Step 4: Commit**

  ```bash
  git add src/BorgDock.Tauri/tests/e2e/visual.spec.ts
  git commit -m "test(visual): wire focus-tab + work-items to ?section= URL routing"
  ```

---

### Task 5 — Wire `?settings=open` route + root-cause `settings.spec.ts:11`

**Files:**
- Modify: `src/BorgDock.Tauri/src/App.tsx` (add a single mount-effect; no other behaviour change).
- Investigate: `src/BorgDock.Tauri/tests/e2e/settings.spec.ts:11` (pre-existing failure).
- Possibly modify: whichever production component the root-cause investigation surfaces.

- [ ] **Step 1: Add the `?settings=open` mount effect**

  Edit `src/BorgDock.Tauri/src/App.tsx`. Inside the `App()` body, after the existing tray-event listener `useEffect` (ending around line 243) and before the `if (!isLoading && needsSetup)` gate (around line 246), insert:

  ```tsx
  // Dev/test-only deep-link: ?settings=open opens the settings flyout
  // on mount so visual.spec.ts can capture it without simulating a click.
  useEffect(() => {
    const isTest =
      import.meta.env.DEV ||
      (typeof window !== 'undefined' &&
        (window as { __PLAYWRIGHT__?: boolean }).__PLAYWRIGHT__ === true);
    if (!isTest) return;
    if (new URLSearchParams(window.location.search).get('settings') === 'open') {
      useUiStore.getState().setSettingsOpen(true);
    }
  }, []);
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd src/BorgDock.Tauri && npx tsc --noEmit 2>&1 | grep -E "App.tsx|error TS" | head -10
  ```

  Expected: no `App.tsx` errors.

- [ ] **Step 3: Root-cause `settings.spec.ts:11`**

  Run the failing spec in isolation against the current code:

  ```bash
  cd src/BorgDock.Tauri && npx playwright test tests/e2e/settings.spec.ts \
    -g "clicking settings icon opens the flyout" \
    --reporter=line 2>&1 | tail -40
  ```

  Read the failure carefully. Likely culprits, in order of probability:

  1. **The `Settings` icon button has no `aria-label="Settings"`** — `Header.tsx:161` does set it, so this should be fine. If the test framework can't find it via `getByRole('button', { name: 'Settings' })`, check whether another button on the page also has the `Settings` accessible name (e.g. an `aria-label` collision in a sibling component) or whether `openSettings` (`tests/e2e/helpers/test-utils.ts:758`) needs to be `.first()`-qualified.
  2. **The click fires but `setSettingsOpen(true)` doesn't propagate** — verify `useUiStore.setSettingsOpen` is reachable from the Header onClick (it is, per Header.tsx:32). If a recent PR replaced it with a tabs-driven dispatch, the onClick may have been dropped.
  3. **The flyout DOM doesn't render the `Settings` span** — `SettingsFlyout.tsx:103` does render `<span>Settings</span>` inside the `data-flyout="settings"` panel. A regression in the conditional render (e.g. an extra wrapping condition added during the PR #6 ancillary migration) could hide it.

  Fix the root cause at the source — do NOT loosen the test. The fix should make BOTH `settings.spec.ts:11` AND a future `?settings=open` URL-routed visual test pass via the same code path.

  Document the root-cause + fix in the commit message in Step 7.

- [ ] **Step 4: Re-run `settings.spec.ts` end-to-end**

  ```bash
  cd src/BorgDock.Tauri && npx playwright test tests/e2e/settings.spec.ts --reporter=line 2>&1 | tail -20
  ```

  Expected: all 8 tests in `settings.spec.ts` pass.

- [ ] **Step 5: Update `visual.spec.ts` `settings` surface**

  Edit `tests/e2e/visual.spec.ts:160-164`. Replace the `settings` entry with:

  ```ts
    {
      id: 'settings',
      path: '/?settings=open',
      ready: '[data-flyout="settings"]',
      note: 'Settings flyout opened via ?settings=open URL deep-link (PR #9). App.tsx mount effect calls useUiStore.setSettingsOpen(true) when the param is present.',
    },
  ```

- [ ] **Step 6: Run the visual settings test** (skip if Task 6 hasn't landed yet)

  ```bash
  cd src/BorgDock.Tauri && npx playwright test tests/e2e/visual.spec.ts \
    -g "settings" \
    --reporter=line 2>&1 | tail -20
  ```

  Expected: locator resolves (no timeout on `[data-flyout="settings"]`). Pixel diff will be RED — that's the design migration signal.

- [ ] **Step 7: Commit**

  ```bash
  git add src/BorgDock.Tauri/src/App.tsx src/BorgDock.Tauri/tests/e2e/visual.spec.ts <any-root-cause-file>
  git commit -m "feat(test-routing): honor ?settings=open + fix settings.spec.ts:11 root cause"
  ```

  Use the commit body to spell out the root-cause finding from Step 3.

---

### Task 6 — Set `__PLAYWRIGHT__` flag from `injectCompletedSetup`

The four URL routes guard on `import.meta.env.DEV || window.__PLAYWRIGHT__`. Vite-served prod builds (the Playwright `webServer` runs `vite preview`, see `playwright.config.ts`) have `import.meta.env.DEV === false`, so the guard relies entirely on `__PLAYWRIGHT__` being set before the page loads.

**Files:**
- Modify: `src/BorgDock.Tauri/tests/e2e/helpers/test-utils.ts` (the `injectCompletedSetup` function around line 443-449).

- [ ] **Step 1: Inject the flag in `injectCompletedSetup`**

  Edit `src/BorgDock.Tauri/tests/e2e/helpers/test-utils.ts:443-449`. Replace the `injectCompletedSetup` body with:

  ```ts
  export async function injectCompletedSetup(page: Page) {
    const settings = completedSettings();
    await page.addInitScript(`
      ${TAURI_MOCK_SCRIPT}
      window.__BORGDOCK_MOCK_SETTINGS__ = ${JSON.stringify(settings)};
      window.__PLAYWRIGHT__ = true;
    `);
  }
  ```

  The flag is set BEFORE the React app loads (via `addInitScript`), so the mount-effect guards in App.tsx, Header.tsx, and NotificationOverlay.tsx all see it as `true`.

- [ ] **Step 2: Re-run the four affected visual tests as a smoke check**

  ```bash
  cd src/BorgDock.Tauri && npx playwright test tests/e2e/visual.spec.ts \
    -g "focus-tab|work-items|settings|toasts|wizard" \
    --reporter=line 2>&1 | tail -30
  ```

  Expected: each test's locator resolves (no `timeout waiting for [data-…]`). Pixel diffs may still be RED — that's expected design-migration noise.

- [ ] **Step 3: Re-run baseline behavioral specs to confirm no regression**

  ```bash
  cd src/BorgDock.Tauri && npx playwright test \
    tests/e2e/settings.spec.ts \
    tests/e2e/pr-list.spec.ts \
    tests/e2e/focus.spec.ts \
    tests/e2e/flyout.spec.ts \
    tests/e2e/work-items.spec.ts \
    --reporter=line 2>&1 | tail -25
  ```

  Expected: same pass count as PR #8 baseline (these specs all use `injectCompletedSetup` but don't set the new query params, so the new mount effects no-op).

- [ ] **Step 4: Commit**

  ```bash
  git add src/BorgDock.Tauri/tests/e2e/helpers/test-utils.ts
  git commit -m "test(e2e): set window.__PLAYWRIGHT__ from injectCompletedSetup so prod-mode test routes activate"
  ```

---

### Task 7 — Wire `?wizard=force` route in App.tsx

The wizard gate at `App.tsx:76-79` reads `settings.setupComplete`. Extend it so `?wizard=force` (under the dev/test guard) forces the wizard to render even when setup is complete. **Production builds must be unaffected** — `import.meta.env.DEV` is the static-eval guard; `__PLAYWRIGHT__` is the runtime guard for `vite preview`.

**Files:**
- Modify: `src/BorgDock.Tauri/src/App.tsx:76-79` (the `needsSetup` derivation).

- [ ] **Step 1: Add a helper for the force-wizard signal**

  Edit `src/BorgDock.Tauri/src/App.tsx`. After the `installTestSeed(...)` call near line 36 and before the `const log = createLogger('app')` line, add:

  ```ts
  // Read once at module scope so the value is stable across renders
  // and impossible to change after the app boots. Production bundles
  // tree-shake this entirely (DEV is statically false) unless the
  // Playwright harness sets __PLAYWRIGHT__ via injectCompletedSetup.
  const forceWizardFromUrl = (() => {
    if (typeof window === 'undefined') return false;
    const isTest =
      import.meta.env.DEV ||
      (window as { __PLAYWRIGHT__?: boolean }).__PLAYWRIGHT__ === true;
    if (!isTest) return false;
    return new URLSearchParams(window.location.search).get('wizard') === 'force';
  })();
  ```

- [ ] **Step 2: Extend the `needsSetup` gate**

  Edit `src/BorgDock.Tauri/src/App.tsx:76-79`. Replace the `needsSetup` declaration with:

  ```tsx
    // GitHub polling (only when setup complete)
    const needsSetup =
      forceWizardFromUrl ||
      !settings.setupComplete ||
      settings.repos.length === 0 ||
      (settings.gitHub.authMethod === 'pat' && !settings.gitHub.personalAccessToken);
  ```

  Putting `forceWizardFromUrl` first short-circuits cleanly. The downstream `useGitHubPolling`, `useInitSequence`, and `show_setup_wizard` IPC calls all key off `needsSetup`, so they all pretend setup is incomplete when the URL forces it — exactly what the visual test wants.

- [ ] **Step 3: Type-check + vitest**

  ```bash
  cd src/BorgDock.Tauri && npx tsc --noEmit 2>&1 | grep -E "App.tsx|error TS" | head -10
  cd src/BorgDock.Tauri && npm test -- --run 2>&1 | tail -10
  ```

  Expected: no `App.tsx` TS errors. 2663 vitest pass.

- [ ] **Step 4: Update `visual.spec.ts` `wizard` surface**

  Edit `tests/e2e/visual.spec.ts:165-169`. Replace the `wizard` entry with:

  ```ts
    {
      id: 'wizard',
      path: '/?wizard=force',
      ready: '[data-wizard-step]',
      note: 'Setup wizard forced via ?wizard=force URL deep-link (PR #9). App.tsx forceWizardFromUrl short-circuits the needsSetup gate; the dev/test guard prevents production bundles from honoring it.',
    },
  ```

  `[data-wizard-step]` is already on the wizard content wrapper at `SetupWizard.tsx:142`.

- [ ] **Step 5: Run the wizard visual test**

  ```bash
  cd src/BorgDock.Tauri && npx playwright test tests/e2e/visual.spec.ts \
    -g "wizard" \
    --reporter=line 2>&1 | tail -15
  ```

  Expected: locator resolves on `[data-wizard-step]`. Pixel diff RED is expected.

- [ ] **Step 6: Commit**

  ```bash
  git add src/BorgDock.Tauri/src/App.tsx src/BorgDock.Tauri/tests/e2e/visual.spec.ts
  git commit -m "feat(test-routing): honor ?wizard=force in App.tsx needsSetup gate (dev/test-only)"
  ```

---

### Task 8 — Wire `?toast=test` route in NotificationOverlay

`NotificationOverlay` is the actual rendered surface (`App.tsx:289`). `NotificationManager.tsx` is dead code — don't touch it. The mount effect goes inside `NotificationOverlay`.

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/notifications/NotificationOverlay.tsx`.

- [ ] **Step 1: Add the mount effect**

  Edit `src/BorgDock.Tauri/src/components/notifications/NotificationOverlay.tsx`. Replace the file with:

  ```tsx
  import { useEffect } from 'react';
  import { useNotificationStore } from '@/stores/notification-store';
  import { NotificationBubble } from './NotificationBubble';

  export function NotificationOverlay() {
    const active = useNotificationStore((s) => s.active);
    const dismiss = useNotificationStore((s) => s.dismiss);

    // Dev/test-only deep-link: ?toast=test pushes a synthetic toast
    // through the real notification-store action so visual.spec.ts can
    // screenshot the toast stack without waiting for a runtime trigger.
    useEffect(() => {
      const isTest =
        import.meta.env.DEV ||
        (typeof window !== 'undefined' &&
          (window as { __PLAYWRIGHT__?: boolean }).__PLAYWRIGHT__ === true);
      if (!isTest) return;
      if (new URLSearchParams(window.location.search).get('toast') === 'test') {
        useNotificationStore.getState().show({
          title: 'Test toast',
          message: 'Synthetic notification for visual.spec.ts capture.',
          severity: 'info',
          actions: [],
        });
      }
    }, []);

    if (active.length === 0) return null;

    return (
      <div data-notification-overlay className="fixed right-3 top-3 z-50 flex flex-col gap-2.5">
        {active.map((item) => (
          <NotificationBubble
            key={item.id}
            notification={item.notification}
            onDismiss={() => dismiss(item.id)}
          />
        ))}
      </div>
    );
  }
  ```

  Reasons for this exact shape:
  - `useNotificationStore.getState().show(...)` — uses the real store action (matches the `motion.spec.ts` toast assertion path).
  - `severity: 'info'` — picks a neutral tone that exists in the `NotificationSeverity` union (`'error' | 'success' | 'warning' | 'info' | 'merged'` per `src/types/notification.ts:1`).
  - `actions: []` — required field on `InAppNotification`.

- [ ] **Step 2: Type-check + vitest**

  ```bash
  cd src/BorgDock.Tauri && npx tsc --noEmit 2>&1 | grep -E "NotificationOverlay.tsx|error TS" | head -10
  cd src/BorgDock.Tauri && npm test -- --run 2>&1 | tail -10
  ```

  Expected: no `NotificationOverlay.tsx` TS errors. 2663 vitest pass.

- [ ] **Step 3: Update `visual.spec.ts` `toasts` surface**

  Edit `tests/e2e/visual.spec.ts:170-174`. Replace the `toasts` entry with:

  ```ts
    {
      id: 'toasts',
      path: '/?toast=test',
      ready: '[data-toast]',
      note: 'Synthetic test toast pushed via ?toast=test URL deep-link (PR #9). NotificationOverlay mount effect calls useNotificationStore.show() with severity:info.',
    },
  ```

  `[data-toast]` is already on `NotificationBubble.tsx:132`.

- [ ] **Step 4: Run the toasts visual test**

  ```bash
  cd src/BorgDock.Tauri && npx playwright test tests/e2e/visual.spec.ts \
    -g "toasts" \
    --reporter=line 2>&1 | tail -15
  ```

  Expected: locator resolves on `[data-toast]`. Pixel diff RED is expected.

- [ ] **Step 5: Commit**

  ```bash
  git add src/BorgDock.Tauri/src/components/notifications/NotificationOverlay.tsx \
          src/BorgDock.Tauri/tests/e2e/visual.spec.ts
  git commit -m "feat(test-routing): honor ?toast=test in NotificationOverlay (dev/test-only)"
  ```

---

### Task 9 — Resolve the `flyout` surface decision

The PR #8 ledger left a "follow-up" hedge in the `flyout` SURFACE note: "FlyoutGlance/FlyoutInitializing have no data-tauri-drag-region — falls back to body until the attribute is added in a follow-up PR."

This PR is the follow-up. Make the explicit decision and update the note. The user-facing constraint says: "Decide in this PR whether to add the attribute to one of them (so `flyout` joins the chromeless `[data-tauri-drag-region]` group) or leave the body fallback documented as a permanent shape (the flyout IS a floating card, not a windowed app)."

**Files:**
- Read: `src/BorgDock.Tauri/src/components/flyout/FlyoutGlance.tsx`, `src/BorgDock.Tauri/src/components/flyout/FlyoutInitializing.tsx`, `src/BorgDock.Tauri/src/components/flyout/FlyoutApp.tsx`.
- Modify: `src/BorgDock.Tauri/tests/e2e/visual.spec.ts:71-76` (the `flyout` SURFACE entry's `note`); possibly the flyout components if you choose to add the attribute.

- [ ] **Step 1: Investigate the flyout component shape**

  ```bash
  cd src/BorgDock.Tauri && grep -n "data-tauri-drag-region" src/components/flyout/*.tsx
  ```

  Expected: zero matches (PR #8 confirmed this).

- [ ] **Step 2: Make the decision**

  Recommended path: **leave body fallback as the permanent shape**. Rationale:
  - The flyout window is a floating glance card, not a movable windowed app — the OS chrome / drag region pattern doesn't fit the surface semantics.
  - Adding `data-tauri-drag-region` purely to satisfy a test-readiness selector is a hack that pollutes the production DOM with a hint that doesn't reflect the surface's role.
  - `body` as the readiness selector still proves the React tree mounted; pixel diff is the actual progress signal.

  If you choose differently (e.g. you decide the FlyoutApp wrapper is conceptually a drag region), add `data-tauri-drag-region` to the appropriate wrapper and update the SURFACE `ready` to match. Document the choice in the commit.

- [ ] **Step 3: Update the SURFACE note**

  Edit `tests/e2e/visual.spec.ts:71-76`. Replace the `flyout` entry's `note` field with the chosen permanent rationale. Example for the recommended path:

  ```ts
    {
      id: 'flyout',
      path: '/flyout.html',
      ready: 'body',
      note: 'Flyout window entry. The flyout is a floating glance card, not a windowed app — data-tauri-drag-region would be semantically inappropriate. body fallback is the permanent ready selector; pixel diff is the progress signal (PR #9 decision).',
    },
  ```

  **Delete the "follow-up PR" hedge entirely** regardless of which option you pick.

- [ ] **Step 4: Commit**

  ```bash
  git add src/BorgDock.Tauri/tests/e2e/visual.spec.ts <any-flyout-component>
  git commit -m "test(visual): resolve flyout surface ready-selector decision (PR #9 follow-up)"
  ```

---

### Task 10 — Full regression + final verification

- [ ] **Step 1: Vitest (full suite)**

  ```bash
  cd src/BorgDock.Tauri && npm test -- --run 2>&1 | tail -15
  ```

  Expected: **2663 pass / 0 fail** (same as PR #8 baseline; this PR is frontend-only routing additions, no logic change).

- [ ] **Step 2: Cargo lib tests**

  ```bash
  cd src/BorgDock.Tauri/src-tauri && cargo test --lib 2>&1 | tail -10
  ```

  Expected: **73 pass / 0 fail** (no Rust changes in this PR — confirming the worktree's Cargo.toml carries the `macos-private-api` darwin override from PR #7).

- [ ] **Step 3: Historic 5-spec Playwright batch**

  ```bash
  cd src/BorgDock.Tauri && npx playwright test \
    tests/e2e/worktree-palette.spec.ts \
    tests/e2e/worktree-changes.spec.ts \
    tests/e2e/file-palette.spec.ts \
    tests/e2e/file-viewer.spec.ts \
    tests/e2e/diff-viewer.spec.ts \
    --reporter=line 2>&1 | tail -25
  ```

  Expected: **18 pass / 7 fail** (unchanged — same infra-deferred fail set as PR #8 baseline).

- [ ] **Step 4: Behavioral specs touched by PR #9**

  ```bash
  cd src/BorgDock.Tauri && npx playwright test \
    tests/e2e/settings.spec.ts \
    tests/e2e/pr-list.spec.ts \
    tests/e2e/focus.spec.ts \
    tests/e2e/flyout.spec.ts \
    tests/e2e/work-items.spec.ts \
    tests/e2e/notifications.spec.ts \
    tests/e2e/wizard.spec.ts \
    --reporter=line 2>&1 | tail -25
  ```

  Expected: all behavioral specs that were green at PR #8 baseline remain green; `settings.spec.ts:11` flips to green per Task 5 root-cause work.

- [ ] **Step 5: Visual surfaces touched by PR #9**

  ```bash
  cd src/BorgDock.Tauri && npx playwright test tests/e2e/visual.spec.ts \
    -g "focus-tab|work-items|settings|wizard|toasts|flyout" \
    --reporter=line 2>&1 | tail -30
  ```

  Expected: every locator resolves (no `timeout waiting for [data-…]`). Pixel diffs may still be RED — that's the design migration progress signal, NOT a PR #9 bug.

- [ ] **Step 6: Document numbers for the ledger commit**

  Capture exact `pass / fail` numbers from each step above for use in Task 11.

  No commit yet — this is verification only.

---

### Task 11 — Update Delivery Ledger §9.1

**Files:**
- Modify: `docs/superpowers/specs/2026-04-24-shared-components-design.md` §9.1 (the existing PR #9 row, currently `Planned`).

- [ ] **Step 1: Flip PR #9 row from `Planned` → `In review`**

  Edit `docs/superpowers/specs/2026-04-24-shared-components-design.md`. Locate the PR #9 row (it already exists from PR #8 — line ~303). Replace it with:

  ```markdown
  | #9 | `feat/streamline-09-visual-routes` | In review | — | 2026-04-26 | Visual surface URL routing: dev/test-guarded `?section=focus|prs|work-items` (Header), `?settings=open` (App), `?wizard=force` (App `needsSetup` gate), `?toast=test` (NotificationOverlay) deep-links so `visual.spec.ts` mounts each per-surface screenshot on the actual target view. Production navigation unaffected — guard is `import.meta.env.DEV || window.__PLAYWRIGHT__`; the prod-mode runtime escape hatch is set by `injectCompletedSetup` Playwright helper (`window.__PLAYWRIGHT__ = true`). `data-section={activeSection}` exposed on Sidebar's content wrapper for stable per-section ready-selectors. Pre-existing `settings.spec.ts:11` ("clicking settings icon opens the flyout") root-caused and fixed as part of Task 5 (see commit body for the actual fault). `flyout` SURFACE decision: <fill in: "drag region added to FlyoutApp" OR "body fallback documented as permanent — flyout is a floating card not a windowed app">. Vitest 2663 pass / 0 fail. Cargo 73 pass / 0 fail. Historic 5-spec Playwright batch 18 pass / 7 fail (infra-deferred set unchanged). Visual baselines remain pending the design migration; Task 10 confirmed every URL-routed surface now resolves its ready-selector. Opened as stacked PR against `feat/streamline-08-test-infra` — <PR-URL>. |
  ```

  Replace `<fill in: ...>` with the actual decision from Task 9, and `<PR-URL>` with the URL after the PR is opened in Task 12 (Step 6 patches it in via a follow-up commit).

- [ ] **Step 2: Commit the ledger flip**

  ```bash
  git add docs/superpowers/specs/2026-04-24-shared-components-design.md
  git commit -m "docs(spec): mark PR #9 as in review"
  ```

---

### Task 12 — Push branch + open PR via `borght-dev` account

**Files:** none (git/gh operations only).

- [ ] **Step 1: Verify branch state**

  ```bash
  git status
  git log --oneline feat/streamline-08-test-infra..HEAD
  ```

  Expected: clean working tree; ~7-8 commits on top of `26e74679`.

- [ ] **Step 2: Push the branch**

  ```bash
  git push -u origin feat/streamline-09-visual-routes
  ```

- [ ] **Step 3: Switch gh account to borght-dev**

  ```bash
  gh auth switch --user borght-dev
  gh auth status 2>&1 | head -5
  ```

  Expected: active account is `borght-dev`.

- [ ] **Step 4: Open the PR**

  ```bash
  gh pr create \
    --base feat/streamline-08-test-infra \
    --head feat/streamline-09-visual-routes \
    --title "Streamline PR #9: visual surface URL routing" \
    --body "$(cat <<'EOF'
  ## Summary

  Wires four dev/test-only URL deep-links so tests/e2e/visual.spec.ts mounts per-surface screenshots on the actual target view instead of the default sidebar:

  - `?section=focus|prs|work-items` — Header dispatches `useUiStore.setActiveSection` on mount
  - `?settings=open` — App.tsx opens the settings flyout via `useUiStore.setSettingsOpen(true)`
  - `?wizard=force` — App.tsx extends the `needsSetup` gate so the wizard renders even when `setupComplete=true`
  - `?toast=test` — NotificationOverlay pushes a synthetic toast through the real `useNotificationStore.show()` action

  All four routes are guarded by `import.meta.env.DEV || window.__PLAYWRIGHT__`. Production navigation is unaffected — `__PLAYWRIGHT__` is set only by the `injectCompletedSetup` Playwright helper, never in shipped builds. Also exposes `data-section={activeSection}` on Sidebar's content wrapper for stable per-section ready-selectors, resolves the `flyout` SURFACE ready-selector decision (see Delivery Ledger), and root-causes the pre-existing `settings.spec.ts:11` failure.

  Stacks on PR #8 (`feat/streamline-08-test-infra`).

  ## Test plan
  - [x] Vitest 2663 pass / 0 fail (unchanged from PR #8 baseline)
  - [x] Cargo `cargo test --lib` 73 pass / 0 fail (unchanged)
  - [x] Historic 5-spec Playwright batch 18 pass / 7 fail (infra-deferred set unchanged)
  - [x] settings.spec.ts:11 ("clicking settings icon opens the flyout") flips green
  - [x] Every URL-routed visual SURFACE resolves its ready-selector (pixel diffs remain RED pending design migration)

  ## Spec
  Spec lives at docs/superpowers/specs/2026-04-24-shared-components-design.md; the Delivery Ledger §9.1 PR #9 row is now In review.
  EOF
  )"
  ```

  Capture the printed PR URL for the next step.

- [ ] **Step 5: Switch gh account back to KvanderBorght_gomocha**

  ```bash
  gh auth switch --user KvanderBorght_gomocha
  gh auth status 2>&1 | head -5
  ```

  Expected: active account is `KvanderBorght_gomocha` (the enterprise default per CLAUDE.md).

- [ ] **Step 6: Patch the PR URL into the ledger**

  Edit `docs/superpowers/specs/2026-04-24-shared-components-design.md` PR #9 row — replace `<PR-URL>` with the actual URL from Step 4. Commit:

  ```bash
  git add docs/superpowers/specs/2026-04-24-shared-components-design.md
  git commit -m "docs(spec): add PR #9 URL to PR #9 ledger row"
  git push
  ```

---

## Constraints (carried over from PR #0–#8)

- All four routes are dev/test only — guard with `import.meta.env.DEV || window.__PLAYWRIGHT__`. Production navigation must not change.
- Don't touch existing store interfaces (`useUiStore` / `useNotificationStore`) — only consume them. The existing `setActiveSection`, `setSettingsOpen`, `show` actions are sufficient — no new store API needed.
- Test-contract `data-*` hooks added in PRs #1–#8 must remain functional. The only new attribute this PR adds is `data-section={activeSection}` on `Sidebar.tsx`'s content wrapper.
- PR #7 and PR #8 ledger rows stay `In review` — don't mark them merged.
- `gh` is on the enterprise account (`KvanderBorght_gomocha`) by default; switch to `borght-dev` only for the `gh pr create` step, then switch back.
- The `-09` worktree's `npm install` and `cargo build` must complete cleanly before vitest / cargo test / playwright can run. The `macos-private-api` Tauri feature override from PR #7 carries through.
- No new `#[tauri::command]` is added in this PR — Tauri main-thread-marshalling rules from `CLAUDE.md` don't apply, but stay alert if the root-cause investigation in Task 5 surfaces an unexpected IPC issue.
- Visual baselines remain RED by design — that's the progress signal, not a blocker. The signal we want from Task 10 Step 5 is that locators resolve, not that pixel diffs vanish.
