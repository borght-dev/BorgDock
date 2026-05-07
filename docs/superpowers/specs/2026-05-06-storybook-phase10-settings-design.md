# Storybook Phase 10 — SettingsApp

**Status:** design approved, plan pending
**Scope:** add an exhaustive Storybook catalog for the Settings window — `src/BorgDock.Tauri/src/settings-main.tsx` → `src/BorgDock.Tauri/src/components/settings/SettingsApp.tsx`. This phase covers (i) `SettingsApp.stories.tsx` for the rail-shell, (ii) one `<Section>.stories.tsx` per of the 11 sections, (iii) one `<Dialog>.stories.tsx` per of the 3 in-Settings dialogs. One new mock alias (`@tauri-apps/plugin-autostart`), no other mock-layer changes. Production code stays byte-identical.

## Why

Per `docs/superpowers/specs/storybook-roadmap.md`, this is the tenth window to be storied and the first phase in wave 2b. Settings is the largest and heaviest-invoke window in the app: 11 sections, 3 dialogs, 12 distinct invokes, 6 Tauri imports including the new `plugin-autostart`, and a rail-with-search shell. Storying it matters because:

- **Recently overhauled UI.** The rail + sections layout is new (`SettingsApp.tsx` was rewritten with `RailSearchInput`/`RailSectionList`/`RailSearchResults` and a `PulseProvider`-driven anchor pulse). The redesign touched every section. A visual catalog is the right place for design review to land.
- **Implicit shake-out for `shared/primitives/*`.** `Toggle`/`ToggleRow`, `Slider`, `Seg2`, `Select`, `TextInput`, `Field`, `Card`, `SectionHeader`, `NumberSpinner`, `Combo`, `KbdHint`, etc. are all exercised through Settings sections. Per the user-approved scope, this phase does NOT add standalone primitive stories — they're a separate cross-cutting workstream — but the section-level coverage produces a usable showcase de facto.
- **First storied window with `plugin-autostart`.** AppearanceSection toggles autostart via `enable()` / `disable()`. The mock is small (no-ops), but the alias must be added or the Storybook bundle fails to resolve the import.
- **Exercises `useSettingsStore` (Zustand) at full surface.** Every section reads and writes `AppSettings`. Storying through direct `useSettingsStore.setState` seed (not via the production `loadSettings` path) makes every story trivially deterministic without leaking plugin-store state across stories.
- **Picks up `RepoScanDialog`, `ConnectionEditorDialog`, `SelfTestResultsDialog`.** These are rendered conditionally by their parent sections in production but are best storied standalone — three small dialog files with focused axes.

## Non-Goals

- **Standalone stories for `shared/primitives/*`** (Toggle, ToggleRow, Slider, Seg2, Select, TextInput, Field, Card, SectionHeader, NumberSpinner, Combo, KbdHint). User-approved decision: defer to a dedicated cross-cutting phase with a uniform axis structure across all primitives. Settings sections give them implicit coverage in the meantime.
- **Standalone stories for `RailSearchInput`, `RailSectionList`, `RailSearchResults`, `HotkeyRecorder`, `useFieldPulse`, `sections-catalog`, `settings-search-index`.** Covered implicitly via `SettingsApp.stories.tsx` and the section stories.
- **`__BORGDOCK_VERSION__` define wiring** beyond verifying it works in Storybook. The rail footer renders `v{__BORGDOCK_VERSION__}` (line 172 of `SettingsApp.tsx`). Storybook's Vite config inherits the project's `define` because `viteFinal` returns the merged config; verification is part of the `Default` window-level story (it should render a non-`undefined` version string).
- **Visual regression / Chromatic / Storybook test-runner integration.** Deferred per roadmap.
- **Hero-shot pipeline integration.** Deferred per roadmap.
- **Touching production code** under `src/components/settings/`, `src/settings-main.tsx`, `src/stores/settings-store.ts`, `src/types/settings.ts`, or any production file outside the Storybook config and the new fixtures + stories paths.
- **Storying `disableDefaultContextMenu()`** — lives in `settings-main.tsx` (the Tauri entry), which stories don't render.
- **Storying the per-platform Windows-Terminal-profile auto-detect** — that's a runtime/Rust concern, not a UI state.
- **Storying `reset_all_settings`'s post-reset reload behavior.** The MaintenanceSection story for "reset confirmation" stops at the user clicking "Reset"; we record the invocation and trust production's downstream reload path.
- **Storying the deep-link section-id validator's reject path.** The validator drops payloads not in `SETTINGS_SECTIONS`; not visually distinct from "no event arrived."
- **Storying every `shared/primitives` variant.** The sections render the variants they happen to use; we don't add stories to enumerate primitive option spaces.

## Constraints

- **No production code changes.** Verified at end-of-phase via:
  ```
  git diff origin/master...storybook-phase10-settings -- \
    src/BorgDock.Tauri/src/components/settings \
    src/BorgDock.Tauri/src/settings-main.tsx \
    src/BorgDock.Tauri/src/stores/settings-store.ts \
    ':(exclude)src/BorgDock.Tauri/src/components/settings/__fixtures__' \
    ':(exclude)src/BorgDock.Tauri/src/components/settings/*.stories.tsx'
  ```
  showing zero changes.
- Storybook 9 + React-Vite + Tailwind v4 setup stays as-is. Only additive changes to `.storybook/main.ts` (one new alias entry).
- The control surface (`window.__borgdock_storybook_tauri`) gets **zero** new fields. We use the existing `invokeResponses`, `invocations`, `pluginStore`, `pluginDialog`, `clipboardWrites` machinery only. Autostart calls land in `invocations` like every other Tauri command.
- **Wave 2b is sequential.** No parallel agents on adjacent storybook phases. The mock-layer edit lands first in commit history; story commits follow.

## Architecture

### File layout

```
src/BorgDock.Tauri/
├── .storybook/
│   ├── main.ts                                       # add @tauri-apps/plugin-autostart alias
│   └── mocks/
│       └── tauri-plugin-autostart.ts                 # NEW: enable/disable no-op record
└── src/components/settings/
    ├── __fixtures__/
    │   └── settings-data.ts                          # canned AppSettings + decorator + helpers
    ├── SettingsApp.stories.tsx                       # 6 window-level stories
    ├── GitHubSection.stories.tsx                     # 3
    ├── RepoSection.stories.tsx                       # 5
    ├── AdoSection.stories.tsx                        # 4
    ├── SqlSection.stories.tsx                        # 4
    ├── AppearanceSection.stories.tsx                 # 3
    ├── NotificationSection.stories.tsx               # 3
    ├── ClaudeSection.stories.tsx                     # 3
    ├── ClaudeApiSection.stories.tsx                  # 2
    ├── AgentOverviewSection.stories.tsx              # 3
    ├── UpdateSection.stories.tsx                     # 3
    ├── MaintenanceSection.stories.tsx                # 4
    ├── RepoScanDialog.stories.tsx                    # 3
    ├── ConnectionEditorDialog.stories.tsx            # 2
    └── SelfTestResultsDialog.stories.tsx             # 2
```

Total story files: 15. Total stories: ~50.

### Mock-layer extension (one new alias)

`.storybook/main.ts` adds `@tauri-apps/plugin-autostart` → `mocks/tauri-plugin-autostart.ts`.

`mocks/tauri-plugin-autostart.ts`:

```ts
// Drop-in replacement for @tauri-apps/plugin-autostart. AppearanceSection
// toggles autostart via enable()/disable(); the mock records the call into
// the standard invocations log so stories can assert on it without a new
// control field.

import { getControl } from './control';

export async function enable(): Promise<void> {
  getControl().invocations.push({ command: 'autostart.enable' });
}

export async function disable(): Promise<void> {
  getControl().invocations.push({ command: 'autostart.disable' });
}
```

The `AutostartFailure` story (AppearanceSection) needs `enable()` to throw. Two implementation choices:

- (i) Add a `pluginAutostartBehavior: 'ok' | 'fail'` field on the control surface.
- (ii) Let the story override the module via Storybook decorators or test-utils.

We pick **(iii) — neither**. The mock checks `getControl().invokeResponses['autostart.enable']` for an explicit error: if the entry exists and is the literal string `'__throw__'` (or a function returning a rejected promise), `enable()` rejects. The story sets `invokeResponses['autostart.enable'] = '__throw__'`. This re-uses the existing per-story machinery without adding a new field. Concrete:

```ts
export async function enable(): Promise<void> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'autostart.enable' });
  const override = ctrl.invokeResponses['autostart.enable'];
  if (override === '__throw__') throw new Error('autostart enable failed');
  if (typeof override === 'function') return override(undefined) as Promise<void>;
}
```

### Hydration: direct Zustand seed

`__fixtures__/settings-data.ts` exports `withSettings(fixture, options?)`:

```ts
import type { Decorator } from '@storybook/react-vite';
import type { AppSettings } from '@/types/settings';
import { useSettingsStore } from '@/stores/settings-store';
import { getControl } from '../../../.storybook/mocks/control';

export interface WithSettingsOptions {
  hasLoaded?: boolean;                          // default: true
  invokeResponses?: Record<string, unknown>;
  search?: string;                              // for SettingsApp stories that pre-populate search
}

export function withSettings(
  fixture: AppSettings,
  options: WithSettingsOptions = {},
): Decorator {
  return (Story) => {
    // The preview decorator calls getControl().reset() before each story; we
    // run after that, so the seed is fresh on every render.
    const ctrl = getControl();
    Object.assign(ctrl.invokeResponses, options.invokeResponses ?? {});
    useSettingsStore.setState({
      settings: fixture,
      hasLoaded: options.hasLoaded ?? true,
    });
    return <Story />;
  };
}
```

Section stories that don't depend on the rail-shell render the section directly inside a `<PulseProvider>` wrapped in a `max-width:720px` content frame matching `SettingsApp`'s body padding. A small helper `<SectionFrame>` lives in fixtures.

### Stories file pattern

Each `<Section>.stories.tsx` follows the SQL/WhatsNew pattern:

```ts
const meta: Meta<typeof GitHubSection> = {
  title: 'Settings/GitHubSection',
  component: GitHubSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;

const baseSettings = makeSettings(); // typical configured user

export const NotAuthenticated: StoryObj<typeof GitHubSection> = {
  decorators: [withSettings(baseSettings, {
    invokeResponses: { check_github_auth: { authenticated: false } },
  })],
  args: { github: baseSettings.gitHub, onChange: () => {} },
};
// ...
```

`SettingsApp.stories.tsx` does NOT use `<SectionFrame>` — it renders the full `<SettingsApp />` and decorators only seed state.

Dialog stories render the dialog directly (each dialog accepts `open` + handlers as props in production; the harness passes `open={true}` and no-op handlers).

### Fixtures (`__fixtures__/settings-data.ts` exports)

| Export | Purpose |
|---|---|
| `makeSettings(overrides?: Partial<AppSettings>): AppSettings` | Build a complete settings object with sensible defaults, override only the slice the story cares about. |
| `firstLaunchSettings: AppSettings` | Minimal first-launch settings (no auth, no repos, no connections). |
| `configuredSettings: AppSettings` | Typical user — GitHub auth, two repos, one ADO connection, one SQL connection, default theme. |
| `withSettings(fixture, options?): Decorator` | Story decorator (see above). |
| `SectionFrame: React.FC` | `<PulseProvider value={...}><div className="mx-auto max-w-[720px] px-9 pb-16 pt-7">{children}</div></PulseProvider>` — section render frame. |
| `repoCandidates: Candidate[]` | Synthetic candidates for the RepoScanDialog stories. |
| `selfTestResults: SelfTestResult[]` | Synthetic self-test rows for the dialog stories. |
| `selfTestMixed: SelfTestResult[]` | Subset with one fail + one warn for the mixed dialog story. |
| `otelStatus: OtelStatus` (running) / `otelStatusError: OtelStatus` (errored) | For AgentOverviewSection. |

## Story Catalog (exhaustive — ~50 stories)

### Window-level — `SettingsApp.stories.tsx` (6)

| Story | What it shows |
|---|---|
| `Default` | `configuredSettings`, GitHub section active. The canonical "this is what Settings looks like." Verifies `__BORGDOCK_VERSION__` renders in the rail footer. |
| `FirstLaunch` | `firstLaunchSettings`, GitHub section active. Empty repo list, no auth, no connections. |
| `LoadingSplash` | `hasLoaded=false`. Window renders the rail + body shell but `useEffect` won't fire `window_ready` invoke. Verified via `getControl().invocations` — `window_ready` should NOT be present (production reveals only after hydrate). |
| `RailSearchActive` | `configuredSettings`, search="repo". Rail renders `RailSearchResults` with hits across multiple sections. |
| `RailSearchNoResults` | `configuredSettings`, search="zzzz". Empty results state in the rail. |
| `DeepLinkArrival` | `configuredSettings`, GitHub active. Play function: `getControl().emit('settings:deep-link', 'ado')`. After flush, ADO section should be active. |

### GitHubSection.stories.tsx (3)

| Story | Axis |
|---|---|
| `NotAuthenticated` | `invoke('check_github_auth')` → `{ authenticated: false }`. CTA visible. |
| `Authenticated` | `invoke('check_github_auth')` → `{ authenticated: true, login: 'borght-dev' }`. User identity rendered. |
| `AuthCheckPending` | `invoke('check_github_auth')` returns a never-resolving promise. Spinner / pending state. |

### RepoSection.stories.tsx (5)

| Story | Axis |
|---|---|
| `Empty` | `configuredSettings.repos = []`. Empty-state CTA. |
| `OneRepo` | One repo. |
| `ManyRepos` | Six repos to exercise scroll / overflow. |
| `ScanDialogOpen` | Many repos + the RepoScanDialog visible (driven via the dialog's `open` prop in a story-only wrapper). |
| `ScanResultsWithCandidates` | Same as above but `scan_repos_under` returns `repoCandidates` (a non-empty `Candidate[]`). |

### AdoSection.stories.tsx (4)

| Story | Axis |
|---|---|
| `NoConnection` | Empty connections array. |
| `OneConnection` | One ADO connection populated. |
| `EditorOpen` | One connection + the `ConnectionEditorDialog` visible (story-wrapper, not interaction). |
| `AzCliNotAvailable` | `invoke('az_cli_available')` → `false`. CLI-required hint visible. |

### SqlSection.stories.tsx (4)

| Story | Axis |
|---|---|
| `NoConnections` | Empty SQL connections. |
| `Typical` | Two SQL connections. |
| `TestRunning` | User clicks "Test connection"; `invoke('test_sql_connection')` returns a never-resolving promise. Spinner. |
| `TestFailed` | `invoke('test_sql_connection')` rejects with an error message. Error inline. |

### AppearanceSection.stories.tsx (3)

| Story | Axis |
|---|---|
| `Default` | `configuredSettings.ui` typical. Theme=system, sidebar=left/pinned, hotkeys configured. |
| `HotkeyRecording` | Story play function clicks one of the three `HotkeyRecorder`s; recorder enters capture state. (See Risks for fragility note — best-effort, drop the play function and pose with `autoFocus` if userEvent capture proves brittle.) |
| `AutostartFailure` | `invokeResponses['autostart.enable'] = '__throw__'`. Story play function clicks the "Run at startup" toggle. The catch branch runs (production swallows with `console.error`). Verifies the production behavior is non-blocking — settings still update. |

### NotificationSection.stories.tsx (3)

| Story | Axis |
|---|---|
| `AllEnabled` | All notification toggles on. |
| `AllDisabled` | All off. |
| `Mixed` | Half on, half off — exercises the per-row toggle visually. |

### ClaudeSection.stories.tsx (3)

| Story | Axis |
|---|---|
| `Default` | Default claudeCode settings — no flags overridden. |
| `Configured` | Custom claude command / args / env vars populated. |
| `HotkeyRecordingActive` | Section's hotkey recorder mid-capture (same risk note as AppearanceSection). |

### ClaudeApiSection.stories.tsx (2)

| Story | Axis |
|---|---|
| `NoApiKey` | API key field empty. CTA / hint visible. |
| `ApiKeySet` | Mask-rendered key with copy / clear actions. |

### AgentOverviewSection.stories.tsx (3)

| Story | Axis |
|---|---|
| `Disabled` | `agent_overview_status` returns `{ enabled: false }`. CTA to enable. |
| `EnabledRunning` | `{ enabled: true, status: 'running', ... }`. Live status panel. |
| `EnabledError` | `{ enabled: true, status: 'error', error: '...' }`. Error visible. |

### UpdateSection.stories.tsx (3)

| Story | Axis |
|---|---|
| `UpToDate` | Current version == latest. |
| `UpdateAvailable` | Latest > current. CTA visible. |
| `Checking` | Update-check pending state. |

### MaintenanceSection.stories.tsx (4)

| Story | Axis |
|---|---|
| `CacheLoaded` | `get_cache_size` resolves to non-zero bytes. Cache row populated. |
| `ClearRunning` | User clicks "Clear cache"; `clear_cache` returns a never-resolving promise. Spinner. |
| `SelfTestCompleted` | `run_self_test` resolves to `selfTestResults`; `SelfTestResultsDialog` is the natural follow-up but lives in its own stories file. This story stops at the success-path summary inline. |
| `ResetConfirmation` | Dialog/inline-confirm visible after user clicks "Reset all settings". Story stops at confirmation; doesn't fire the actual reset. |

### Dialogs

#### RepoScanDialog.stories.tsx (3)

| Story | Axis |
|---|---|
| `Scanning` | `scan_repos_under` returns a never-resolving promise. Spinner state. |
| `ResultsEmpty` | Resolves to `[]`. Empty-results state. |
| `ResultsWithCandidates` | Resolves to `repoCandidates` (≥ 4 entries). User can select / deselect. |

#### ConnectionEditorDialog.stories.tsx (2)

| Story | Axis |
|---|---|
| `New` | Empty form (creating a new connection). |
| `EditExisting` | Form populated from an existing connection. |

#### SelfTestResultsDialog.stories.tsx (2)

| Story | Axis |
|---|---|
| `AllPassed` | All `SelfTestResult.status === 'pass'`. Green summary. |
| `MixedResults` | One pass, one fail, one warn. Summary + per-row indicators. |

## Tooling additions

### `package.json`

No new dependencies. `vite-plugin-static-copy` is already present (Phase 9).

### `tsconfig.json`

No changes. Stories under `src/components/settings/*.stories.tsx` are picked up by the existing `include` patterns.

### Biome

No changes. `biome.json` already permits `*.stories.tsx`.

### Test suites

- Existing vitest tests under `src/components/settings/__tests__/` continue to pass unchanged.
- Stories add no new vitest tests directly. (Storybook's per-story play functions execute under `npm run build-storybook`'s test-runner if invoked, but we don't add a test-runner step in this phase.)

## Risks & mitigations

1. **Section count creep (~50 stories).** Plan must keep tasks ≤5 minutes each. Mitigation: one task per stories file = 15 tasks plus ~3 scaffold tasks = ~18 tasks total. Each section file gets a dedicated commit so the diff is reviewable per-section.

2. **`__BORGDOCK_VERSION__` define resolution.** Storybook's Vite config inherits the `define` block via `viteFinal` (project's `vite.config.ts` exports the define alongside the rest). Verification: `Default` window-level story asserts no `vundefined` in the rendered DOM. If broken: extend `viteFinal` to merge the define explicitly.

3. **`HotkeyRecorder` play-function fragility.** Capturing keyboard events through Storybook's `userEvent` is fragile when the recorder uses raw `keydown` listeners. Mitigation: prefer setting the recorder's internal "isRecording" state directly via the harness if `HotkeyRecorder` exposes a controlled API. Otherwise, fall back to a play function that focuses the recorder + dispatches one synthesized `keydown` and accepts any visual state. If even that is too brittle, drop the `HotkeyRecording` story and replace with a static `RecorderFocused` story that just sets focus.

4. **Zustand store cross-story leakage.** `useSettingsStore` is a module singleton. The `withSettings` decorator runs `setState` unconditionally on every render, NOT in a `useEffect` — so the state is correct before the first paint, and there's no leak from a prior story (the prior story's setState was ALSO unconditional and happened first). Mitigation already baked in.

5. **`__fixtures__/settings-data.ts` size.** AppSettings has many slices; the fixture's `makeSettings` helper must cover all of them. Mitigation: copy the type's default-value pattern from `src/types/settings.ts` defaults (or `src/stores/settings-store.ts`'s initial state) verbatim.

6. **Dialog story-wrapping.** `RepoScanDialog`/`ConnectionEditorDialog`/`SelfTestResultsDialog` may use a portal (`createPortal`) which renders outside the Storybook iframe's normal mount point. If `<Story />` doesn't show the dialog, wrap in a `<div id="storybook-root" />` matching the portal target, OR pass `usePortal={false}` if the components support it (verify in the implementation), OR render the dialog at the same DOM level as the harness (no portal).

7. **`PulseProvider` requirement for sections.** Sections are wrapped in `PulseProvider` only by `SettingsApp`. Section stories MUST wrap in their own `<PulseProvider>` (via `<SectionFrame>`) or `useFieldPulse` will throw. The fixtures helper handles this.

8. **Mock-layer ordering.** Per the wave-2 protocol, the new `plugin-autostart` mock + alias commit MUST land before any story commits in this branch. Plan's commit ordering enforces this.

9. **Roadmap edit conflict.** Wave 2b is sequential, so by the time this PR opens, master has rows 7–9 settled. The PR adds row 10 = Settings + a new Phase 10 mock-layer note. No row collisions expected since wave 2b is solo.

## Acceptance criteria

- All ~50 stories render without errors in `npm run build-storybook`.
- `npm run test` passes (existing 2772 tests + any tests added by this branch should remain green; this phase adds no new vitest tests).
- `npm run build-storybook` succeeds and produces a valid `storybook-static/` output.
- Production tree byte-identical to `origin/master` per the `git diff` in Constraints.
- New mock file `tauri-plugin-autostart.ts` exists; new alias entry in `.storybook/main.ts` matches the alphabetical order pattern of the existing aliases (or matches whatever pattern the file currently uses; alignment to existing format is non-negotiable).
- `docs/superpowers/specs/storybook-roadmap.md` updated: Settings moved Pending → Done as row 10, new "Phase 10 mock-layer extensions" note describing the `plugin-autostart` alias.
- Phase 10 commits ordered: mock-layer first, fixtures second, then stories per section/dialog.

## What comes next (out of scope here)

- Phase 11 (Pr Detail). Wave 2b's second window. Sequential after Phase 10 merges.
- Phase 12 (Main / Sidebar). Wave 3, solo last.
- Cross-cutting `shared/primitives/*` showcase phase. Now unblocked by Phase 10 — Settings sections give us implicit usage data on which primitives need exhaustive axis coverage and which don't.
- Per-section component story phase. Same workstream as the primitives showcase. The section stories in this PR cover scenarios; a follow-up phase could add interaction tests and edge cases to each section's own component-level stories file.
