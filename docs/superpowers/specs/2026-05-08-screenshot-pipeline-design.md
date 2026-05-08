# Hero-Shot / Screenshot Pipeline — Design

**Status:** Spec. Awaiting plan + implementation. Lands as the PR immediately after Phase 12.
**Roadmap entry:** the "Hero-shot pipeline" cross-cutting workstream listed under "Cross-cutting workstreams (post-catalog)" in `docs/superpowers/specs/storybook-roadmap.md`.
**Sibling spec:** `2026-05-08-storybook-phase12-main-sidebar-design.md` — Phase 12 produces the `Hero_*` stories this pipeline captures.

## Intro

Replaces `scripts/screenshot-heroes.mjs` with a single capture script that derives every screenshot in the repo from a Storybook story. One source of truth: each screenshot is a story whose `parameters.screenshot` declares output path, viewport, and capture rules. The script enumerates tagged stories and writes PNGs.

## Why

Today, screenshots come from one of two ad-hoc sources:

1. **`scripts/screenshot-heroes.mjs`** reads `design/mockups/whats-new-<VERSION>.html` — a hand-built HTML file authored fresh per release. It does not exercise BorgDock's actual code paths; it's a separate styling pipeline that drifts from the real UI.
2. **README and docs screenshots** are captured manually from a running `tauri dev` window with whatever data happens to be loaded. State posing is ad-hoc and irreproducible.

Both diverge from the real UI as the codebase evolves. With 12 windows storied (after Phase 12 lands), every screen has a deterministic, mock-fed Storybook representation. Pivoting screenshot generation onto stories means:

- Real production components, real CSS, real chrome — no mockup divergence.
- Reproducible: regenerate every screenshot from one command.
- Cheap to add: a new screenshot is just a new story with `parameters.screenshot`.

Use cases targeted:

- **Per-release whatsnew banners** (450×74 — used inside the WhatsNewApp window).
- **README hero** (large composed shot of sidebar + pop-out).
- **Marketing site / `site/` gallery** (one shot per major window).
- **Per-feature inline doc images** (smaller focused shots embedded in markdown docs).

## Non-goals

- **Visual regression testing.** This script writes PNGs but doesn't compare. Diffing is a separate roadmap workstream.
- **OS chrome compositing.** BorgDock paints its own window chrome inside the React tree; no fake macOS/Windows frame needed.
- **Multi-OS captures.** Single Chromium run on the developer's machine (or CI) is enough. Cross-OS screenshots are out of scope.
- **CI gating.** Screenshots are committed artifacts, regenerated on demand. CI does not block PRs on screenshot regeneration — too easy to make flaky.
- **Migrating existing whatsnew mockups.** The historical `design/mockups/whats-new-1.x.x.html` files stay as-is. New releases use the story-based flow.
- **Removing `screenshot-heroes.mjs` in this PR while existing release branches still depend on it.** This spec replaces the script — but if any active release branch is mid-flight, scheduling that retirement is the implementer's call. Default: replace outright; the historical mockups don't need the script to render the PNGs they already produced.

## Constraints

- **Output paths declared per-story, not in a global config.** Stories self-describe their destination. The script is dumb: read parameter, capture, write.
- **Static Storybook build, not dev server.** Captures run against `storybook-static/` for determinism and CI-friendliness. The script auto-rebuilds if `storybook-static/` is missing or older than the source.
- **Determinism guards mandatory.** All `Hero_*` and screenshot-tagged stories must:
  - Use absolute, pinned dates in fixtures (no `new Date()` at story-resolution time).
  - Freeze animations via the `freezeAnimations` decorator from Phase 12's fixture helpers.
  - Reset scroll positions before capture.
  - Wait for `document.fonts.ready` and any story-declared `waitFor` selector.
- **Output paths are repo-relative.** The script resolves them against the repo root (`src/BorgDock.Tauri/../..`), creating intermediate directories as needed. Stories don't know the repo layout; they declare paths like `docs/hero/readme-main.png`.
- **Two collisions = error.** If two stories declare the same `output`, the script aborts before writing. Last-write-wins is a footgun.

## Architecture

### Script: `scripts/capture-screenshots.mjs`

Replaces `scripts/screenshot-heroes.mjs`. Lives in the same `src/BorgDock.Tauri/scripts/` directory. Exposed as `bun run capture-screenshots` from the workspace member's `package.json`.

Flow:

1. **Build (or reuse) Storybook static.** Check `storybook-static/index.json` exists and is newer than `src/**/*.stories.tsx` and `.storybook/**`. If not, run `bun run build-storybook` (which is `storybook build`).
2. **Read `storybook-static/index.json`.** Storybook 9 emits this index file naming every story by ID (`main-window-app--hero-readme-main`) and pointing to the iframe URL.
3. **Filter to screenshot-tagged stories.** Stories opt in via `parameters.screenshot`. The index contains parameters; if absent there (varies by Storybook version), fall back to fetching each iframe and reading from `__STORYBOOK_PREVIEW__` — but the indexer is the preferred path.
4. **Spin up a static file server** (using `serve-handler` or Playwright's `route` interception) on a random localhost port pointing at `storybook-static/`.
5. **Launch headless Chromium** via `@playwright/test` (already a project dependency).
6. **For each tagged story:**
   - Open `iframe.html?id=<storyId>&viewMode=story`.
   - Resize viewport to `width × height` from `parameters.screenshot`.
   - Set `deviceScaleFactor` (default 2).
   - Inject animation-disable CSS as a belt-and-braces guard:
     ```css
     *, *::before, *::after {
       animation-duration: 0s !important;
       transition-duration: 0s !important;
     }
     ```
   - `await document.fonts.ready`.
   - If `parameters.screenshot.waitFor` is set, `await page.waitForSelector(...)`.
   - Optional 100ms settle pause for layout-shift safety.
   - If `parameters.screenshot.selector` is set, capture that element's bounding box; else capture the iframe body.
   - Write PNG to repo-relative `parameters.screenshot.output`.
7. **Tear down browser, log summary** (`N screenshots written, M skipped, K errors`).

### Story-side contract

```ts
// In any *.stories.tsx file
export const Hero_ReadmeMain: Story = {
  parameters: {
    screenshot: {
      output: 'docs/hero/readme-main.png', // repo-relative
      width: 1600,
      height: 1000,
      deviceScaleFactor: 2,                // optional, default 2
      waitFor: '[data-screenshot-ready]',  // optional CSS selector
      selector: undefined,                  // optional — capture this element instead of body
    },
  },
};
```

A small TypeScript helper exported from `.storybook/screenshot.ts` gives stories a typed shape:

```ts
export interface ScreenshotParameters {
  output: string;
  width: number;
  height: number;
  deviceScaleFactor?: number;
  waitFor?: string;
  selector?: string;
}

export function screenshot(params: ScreenshotParameters): {
  screenshot: ScreenshotParameters;
} {
  return { screenshot: params };
}

// Story usage: parameters: screenshot({ output: '...', width, height })
```

### Output taxonomy

The script writes wherever stories tell it to. Conventions for the four use cases:

| Context | Path pattern | Source story |
|---|---|---|
| README hero | `docs/hero/<slug>.png` | `App.stories.tsx` `Hero_*` |
| Marketing site gallery | `site/public/screenshots/<slug>.png` | per-window `*App.stories.tsx` `Hero_*` |
| Inline doc images | `docs/<area>/<slug>.png` | various stories `Hero_Doc*` |
| Whatsnew banners | `docs/whats-new/<VERSION>/<slug>.png` | `whats-new.stories.tsx` per-release `WhatsNewBanner_*` |

The script doesn't enforce these — it writes to whatever `output` says. The convention is documented and enforced via review.

### Per-release whatsnew workflow

Replaces today's `node scripts/screenshot-heroes.mjs <VERSION>` and `design/mockups/whats-new-<VERSION>.html` flow.

For release `vX.Y.Z`:

1. Add per-feature stories to `src/components/whats-new/whats-new.stories.tsx`. Each consumes the `Hero_WhatsNewTemplate` composition (defined in the same file when this pipeline lands; see "What lands in this PR" below) and sets `parameters.screenshot`:
   ```ts
   export const WhatsNewBanner_AdoSearch: Story = {
     parameters: screenshot({
       output: 'docs/whats-new/X.Y.Z/ado-search.png',
       width: 900,    // 2× of 450 because deviceScaleFactor=2
       height: 148,   // 2× of 74
       deviceScaleFactor: 2,
     }),
     // story body composes the banner content for this feature
   };
   ```
2. `bun run capture-screenshots` regenerates everything; the per-release PNGs land in `docs/whats-new/X.Y.Z/` and are committed alongside the release PR.
3. The hand-built `design/mockups/whats-new-X.Y.Z.html` files are no longer authored. The `screenshot-heroes.mjs` script is deleted in this pipeline PR (or kept as a thin shim that delegates if any in-flight release branch needs it; default is delete).

### What lands in this PR (vs Phase 12)

| Artifact | This PR | Phase 12 PR |
|---|---|---|
| `scripts/capture-screenshots.mjs` | yes | no |
| `bun run capture-screenshots` script wiring | yes | no |
| `bun run build-storybook` script wiring | yes | no |
| `.storybook/screenshot.ts` helper | yes | no |
| `App.stories.tsx` `Hero_*` story bodies | no | yes |
| `App.stories.tsx` `Hero_*` `parameters.screenshot` declarations | yes (added in this PR) | no |
| `parameters.screenshot` added to a curated subset of prior-phase stories (Settings, PR Detail, File Viewer, SQL, etc.) for the marketing/docs gallery | yes (added in this PR) | no |
| `Hero_WhatsNewTemplate` story in `whats-new.stories.tsx` | yes | no |
| Per-release `WhatsNewBanner_*` stories | no — added per release PR | no |
| First batch of generated `docs/hero/*.png`, `site/public/screenshots/*.png`, `docs/<area>/*.png` | yes (generated and committed in this PR) | no |
| Deletion of `scripts/screenshot-heroes.mjs` | yes (default) | no |
| Roadmap update (cross-cutting workstreams: hero-shot pipeline → done) | yes | no |

The "curated subset of prior-phase stories" point matters: the marketing site gallery wants representative shots from the major windows (Settings, PR Detail, etc.), not the full state catalog. This PR picks one or two stories per window and adds `parameters.screenshot` to those — a small, surgical edit to existing story files. The story bodies do not change.

Phase 12 lands the `Hero_*` story *bodies* (the canvas content) without the `parameters.screenshot` block — the stories render in Storybook for design review but the pipeline ignores them. This pipeline PR adds the `parameters.screenshot` declarations on top of the existing stories, so Phase 12's PR doesn't introduce a contract this PR is supposed to define.

This split keeps Phase 12 self-contained (catalog only, no pipeline coupling) and the pipeline PR self-contained (tooling + tagging + first capture run, all together).

## Tooling

- **`@playwright/test`** — already a dev dependency (used by `screenshot-heroes.mjs` and the Playwright e2e harness).
- **`@storybook/react-vite` + `storybook build`** — already configured.
- **`serve-handler`** (or equivalent — `sirv`, `serve`) — small new dev dependency for the static file server. Pick the lightest option.
- **No new test framework.** The script is run on demand, not part of `bun run test`.

## Risks

1. **Storybook `index.json` shape varies across versions.** Phase 12's roadmap pins Storybook 9; this script pins to 9.x in `package.json`. If the index shape changes in a minor, the parser breaks; an integration test that asserts the parsed shape would catch this. MVP can rely on the Storybook major-version pin and a brittle parser; a follow-up adds a contract test.
2. **Font loading races.** Custom fonts injected via Tailwind v4's preflight or `@font-face` need to fully load before capture. `document.fonts.ready` is the correct gate; if a screenshot still shows fallback fonts, the story declares an explicit `waitFor` selector that depends on the styled element.
3. **Composed multi-window stories** (`Hero_ReadmeMain`) layout-shift more than single-component stories. The 100ms settle pause is the first knob; a story-declared `waitFor` is the second.
4. **Per-release banner story sprawl.** After ten releases, `whats-new.stories.tsx` has 40+ banner stories. The pipeline still captures each on every run, slow over time. Mitigation: a `parameters.screenshot.skipUnlessChanged` flag (or an `--only=<glob>` filter) in a follow-up. Not in MVP.
5. **Output path collisions silent until script runs.** Two stories with the same `output` is an error caught at script time, not at lint time. Acceptable; the alternative (build-time validation) is more infrastructure than the value justifies.
6. **Screenshots committed to the repo.** PNG diffs in PRs are noisy. Conventions:
   - PR descriptions explicitly note "regenerated screenshots" if relevant.
   - Reviewers ignore PNG diffs unless inspection is requested.
   - We do not use git LFS — the PNGs are small (<50 KB each at 2× scale for sidebar-sized shots).
7. **Capture-host font availability.** The system Chromium uses the OS's installed fonts. If a developer or CI lacks the same fonts as the maintainer, captures differ. Mitigation: stories use Tailwind's font stack which falls back to system-ui; the WhatsNewApp's HeroBanner uses `--font-display` from Tailwind which resolves consistently. If divergence shows up, a font-pinning Playwright config is a follow-up.

## Acceptance

- [ ] `bun run capture-screenshots` runs end-to-end against a fresh `storybook-static/` and writes every tagged story's PNG to its declared path.
- [ ] `bun run build-storybook` is wired in `package.json`.
- [ ] `.storybook/screenshot.ts` exports a typed `screenshot()` helper with the parameter shape from Architecture.
- [ ] At least one story per use case has `parameters.screenshot` declared and produces a committed PNG:
  - README hero (`docs/hero/readme-main.png`).
  - Marketing site shot (`site/public/screenshots/<slug>.png` × N for the major windows).
  - Inline doc image (`docs/<area>/<slug>.png` × N).
  - WhatsNew template (`Hero_WhatsNewTemplate` defined; per-release banners are added in release PRs).
- [ ] `scripts/screenshot-heroes.mjs` is deleted (or kept as a deprecation shim with a console warning) — default delete.
- [ ] Output-path collision detection — two stories with the same `output` cause the script to error out before writing.
- [ ] README is updated to embed the new `docs/hero/readme-main.png` (the hero shot is *visible* on the GitHub front page once this PR merges — proves end-to-end value).
- [ ] `docs/superpowers/specs/storybook-roadmap.md` "Cross-cutting workstreams (post-catalog) → Hero-shot pipeline" entry updated to "done", linking this spec, plan, and PR.
- [ ] PR opened from `screenshot-pipeline` branch via the personal `gh` account, switched back to enterprise after.

## What comes next

1. **Plan**: `docs/superpowers/plans/2026-05-08-screenshot-pipeline.md` — task-by-task implementation plan generated by the writing-plans skill.
2. **Per-release whatsnew workflow becomes the default.** Next BorgDock release adds `WhatsNewBanner_*` stories instead of editing `design/mockups/whats-new-<VERSION>.html`. The release procedure documentation gets updated in that release's PR (not this one).
3. **Visual regression** as a follow-up: once captured PNGs are stable, layer Chromatic / Storybook test-runner snapshots / pixelmatch against the committed PNGs. Separate roadmap workstream.
4. **Static Storybook hosting** as an additional follow-up: `storybook build` already produces a hostable artifact; publishing it makes the same stories that drive screenshots browseable by designers and contributors.
