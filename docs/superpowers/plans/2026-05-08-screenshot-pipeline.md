# Hero-Shot / Screenshot Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `scripts/screenshot-heroes.mjs` with a story-driven screenshot pipeline. New `scripts/capture-screenshots.mjs` reads a built static Storybook (`storybook-static/`), iterates stories tagged with `parameters.screenshot`, and writes PNGs to repo-relative paths declared per story.

**Architecture:** Single script + typed helper + batch of `parameters.screenshot` annotations on existing stories. Phase 12's `Hero_*` stories get tagged here (their bodies already exist from the prior PR). A curated subset of prior-phase stories also gets tagged for the marketing-site gallery. First captured PNGs are committed to the repo; README is updated to embed the README hero shot.

**Tech Stack:** `@playwright/test` (existing dev dep), `serve-handler` (new dev dep, light static server), Storybook 9 `index.json` enumeration, Node-fetch via Playwright page navigation.

**Spec:** `docs/superpowers/specs/2026-05-08-screenshot-pipeline-design.md` (must read before starting). Branch is `screenshot-pipeline`. Spec must be committed on this branch before Task 1.

**Prerequisite:** Phase 12 must be merged to `master` before starting this plan — it provides the `Hero_*` story bodies.

---

## Phase outline

- **Phase A — Helper (Task 1):** `.storybook/screenshot.ts` exports the typed `screenshot()` parameter helper.
- **Phase B — Capture script (Tasks 2–4):** `scripts/capture-screenshots.mjs` skeleton, story enumeration, capture loop.
- **Phase C — Tag Phase 12 hero stories (Task 5):** add `parameters.screenshot` to the four `Hero_*` stories from `App.hero.stories.tsx`.
- **Phase D — Tag prior-phase gallery stories (Task 6):** curated `parameters.screenshot` additions to `WhatsNewApp.stories.tsx`, `SettingsApp.stories.tsx`, `PRDetailApp.stories.tsx`, `FileViewerApp.stories.tsx`, `SqlApp.stories.tsx`, etc. — one or two stories per major window.
- **Phase E — WhatsNew template (Task 7):** add `Hero_WhatsNewTemplate` story to `whats-new.stories.tsx` for the per-release banner workflow.
- **Phase F — Wire scripts + first capture (Tasks 8–9):** `bun run capture-screenshots`, `bun run build-storybook`, run the pipeline, commit generated PNGs.
- **Phase G — README + retire heroes script (Tasks 10–11):** embed `docs/hero/readme-main.png` in the repo README, delete `screenshot-heroes.mjs`.
- **Phase H — Roadmap + PR (Tasks 12–13):** update roadmap cross-cutting workstreams, open PR.

---

## Task 0: Verify branch & prerequisites

**Files:** none (verification only).

- [ ] **Step 1: Confirm Phase 12 is on master**

```bash
cd /Users/koenvdb/projects/BorgDock
git checkout master && git pull --ff-only
git log --oneline -5 | grep "phase 12"
```

Expected: at least one commit referencing "phase 12". If absent, stop — Phase 12 must merge first.

- [ ] **Step 2: Create the screenshot-pipeline branch**

```bash
git checkout -b screenshot-pipeline
```

- [ ] **Step 3: Confirm `Hero_*` stories exist**

```bash
ls /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/App.hero.stories.tsx
grep -E "Hero_(ReadmeMain|DocFocusList|DocPrsList|DocWorkItems)" /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/App.hero.stories.tsx
```

Expected: all four story exports present.

- [ ] **Step 4: Baseline test suite**

```bash
bun run test 2>&1 | tail -10
```

Expected: clean pass. Record the test count for comparison after Task 9.

---

## Task 1: Typed `screenshot()` helper

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/screenshot.ts`

- [ ] **Step 1: Write the helper**

```ts
// .storybook/screenshot.ts
//
// Typed Storybook parameter for the capture pipeline. Stories opt in by
// setting `parameters: screenshot({ output: '...', width, height })`.
// The capture script reads `parameters.screenshot` from the Storybook
// static index and writes the PNG to <output>.

export interface ScreenshotParameters {
  /** Repo-root-relative output path, e.g. 'docs/hero/readme-main.png'. */
  output: string;
  /** CSS pixel width. Final PNG width is width * deviceScaleFactor. */
  width: number;
  /** CSS pixel height. */
  height: number;
  /** Device scale factor for crisp captures. Default 2. */
  deviceScaleFactor?: number;
  /** Optional CSS selector to wait for before capturing. */
  waitFor?: string;
  /** Optional CSS selector to capture instead of the iframe body. */
  selector?: string;
}

export function screenshot(params: ScreenshotParameters): {
  screenshot: ScreenshotParameters;
} {
  return { screenshot: params };
}
```

- [ ] **Step 2: Run lint to confirm it parses**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run lint 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/screenshot.ts
git commit -m "screenshot pipeline: typed parameters.screenshot helper"
```

---

## Task 2: Capture script skeleton

**Files:**
- Create: `src/BorgDock.Tauri/scripts/capture-screenshots.mjs`

- [ ] **Step 1: Add `serve-handler` as a dev dependency**

```bash
cd /Users/koenvdb/projects/BorgDock
bun add -d -D serve-handler
```

Expected: `package.json` and `bun.lock` updated. The `--filter` flag may not be needed if the dependency is added at the repo root; if it must live under `src/BorgDock.Tauri/`, run from inside that dir instead.

If the workspace requires the dep on the Tauri member, use:

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun add -d serve-handler
```

- [ ] **Step 2: Write the script skeleton**

Write `src/BorgDock.Tauri/scripts/capture-screenshots.mjs`:

```js
#!/usr/bin/env node
// scripts/capture-screenshots.mjs
//
// Story-driven screenshot pipeline. Replaces scripts/screenshot-heroes.mjs.
//
// Flow:
//   1. Build storybook-static/ if missing or stale.
//   2. Read storybook-static/index.json — enumerate stories.
//   3. Filter to stories with parameters.screenshot.
//   4. Spin up a static server pointing at storybook-static/.
//   5. Launch Chromium, navigate to each iframe URL, capture PNG.
//   6. Write each PNG to the story's declared output path (repo-relative).

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from 'serve-handler';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const storybookStatic = path.join(packageRoot, 'storybook-static');

function fail(msg) {
  console.error(`capture-screenshots: ${msg}`);
  process.exit(1);
}

async function ensureStorybookBuilt() {
  if (!fs.existsSync(path.join(storybookStatic, 'index.json'))) {
    console.log('capture-screenshots: storybook-static/ missing — building…');
    await runBuildStorybook();
    return;
  }
  // Optional staleness check could compare mtimes against src/**/*.stories.tsx
  // — skipped in MVP. Pass --rebuild to force.
  if (process.argv.includes('--rebuild')) {
    console.log('capture-screenshots: --rebuild — rebuilding…');
    await runBuildStorybook();
  }
}

function runBuildStorybook() {
  return new Promise((resolve, reject) => {
    const child = spawn('bun', ['run', 'build-storybook'], {
      cwd: packageRoot,
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`build-storybook exited ${code}`));
    });
  });
}

function enumerateStories() {
  const indexPath = path.join(storybookStatic, 'index.json');
  const idx = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const entries = Object.values(idx.entries ?? idx.stories ?? {});
  const tagged = [];
  for (const e of entries) {
    const params = e.parameters ?? {};
    if (params.screenshot) tagged.push({ id: e.id, name: e.name, screenshot: params.screenshot });
  }
  return tagged;
}

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      handler(req, res, { public: storybookStatic, cleanUrls: false });
    });
    server.listen(0, () => {
      const port = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

async function captureStory(page, baseUrl, story) {
  const sp = story.screenshot;
  const dsf = sp.deviceScaleFactor ?? 2;
  await page.setViewportSize({ width: sp.width, height: sp.height });
  // Re-create context for deviceScaleFactor change is overkill; use CSS zoom or
  // accept dsf=2 globally per BrowserContext. We set dsf on the context itself.
  await page.goto(`${baseUrl}/iframe.html?id=${story.id}&viewMode=story`);
  await page.addStyleTag({
    content: `*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }`,
  });
  await page.evaluate(() => document.fonts.ready);
  if (sp.waitFor) await page.waitForSelector(sp.waitFor, { timeout: 5000 });
  await page.waitForTimeout(100); // small settle pause

  const outPath = path.resolve(repoRoot, sp.output);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  if (sp.selector) {
    const el = await page.$(sp.selector);
    if (!el) throw new Error(`selector "${sp.selector}" not found in story ${story.id}`);
    await el.screenshot({ path: outPath, omitBackground: false });
  } else {
    await page.screenshot({ path: outPath, omitBackground: false, fullPage: false });
  }
  console.log(`wrote ${path.relative(repoRoot, outPath)}`);
}

async function main() {
  await ensureStorybookBuilt();

  const stories = enumerateStories();
  if (stories.length === 0) fail('no stories with parameters.screenshot found');

  // Detect duplicate output paths
  const seen = new Map();
  for (const s of stories) {
    const out = s.screenshot.output;
    if (seen.has(out)) {
      fail(`duplicate output path "${out}" — used by ${seen.get(out)} and ${s.id}`);
    }
    seen.set(out, s.id);
  }

  const { server, url } = await startStaticServer();
  console.log(`capture-screenshots: serving storybook-static/ at ${url}`);

  // Use a single context with deviceScaleFactor=2 for all captures. Stories
  // can override via parameters.screenshot.deviceScaleFactor (rare).
  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();

  let count = 0;
  let errors = 0;
  for (const story of stories) {
    try {
      await captureStory(page, url, story);
      count++;
    } catch (err) {
      console.error(`capture-screenshots: failed for ${story.id}: ${err?.message ?? err}`);
      errors++;
    }
  }

  await browser.close();
  server.close();

  console.log(`\ncapture-screenshots: ${count} written, ${errors} errors`);
  if (errors > 0) process.exit(1);
}

main().catch((e) => fail(e?.message ?? String(e)));
```

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/scripts/capture-screenshots.mjs src/BorgDock.Tauri/package.json
[ -f /Users/koenvdb/projects/BorgDock/bun.lock ] && git add bun.lock
git commit -m "screenshot pipeline: capture-screenshots.mjs skeleton"
```

---

## Task 3: Wire `package.json` scripts

**Files:**
- Modify: `src/BorgDock.Tauri/package.json`

- [ ] **Step 1: Inspect current scripts**

```bash
grep -A 1 '"scripts"' /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/package.json | head -30
```

Confirm `build-storybook` and `capture-screenshots` are NOT yet in the scripts block.

- [ ] **Step 2: Add scripts**

Edit `src/BorgDock.Tauri/package.json`. In the `"scripts"` block, add:

```json
    "build-storybook": "storybook build",
    "capture-screenshots": "node scripts/capture-screenshots.mjs"
```

If `build-storybook` already exists from Phase 12, leave it. Order them next to the other `storybook` scripts.

- [ ] **Step 3: Smoke-test the script wires correctly**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run capture-screenshots 2>&1 | head -10
```

Expected: the script runs, builds storybook-static/ (if needed), discovers the four `Hero_*` stories from Phase 12 — but they don't yet have `parameters.screenshot`, so the script will report `no stories with parameters.screenshot found` and exit 1. That's the correct behavior at this stage.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/package.json
git commit -m "screenshot pipeline: wire capture-screenshots + build-storybook scripts"
```

---

## Task 4: Tag Phase 12 hero stories with `parameters.screenshot`

**Files:**
- Modify: `src/BorgDock.Tauri/src/App.hero.stories.tsx`

Add `parameters.screenshot` to each of the four `Hero_*` stories.

- [ ] **Step 1: Read current file**

```bash
sed -n '1,80p' /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/App.hero.stories.tsx
```

- [ ] **Step 2: Add the screenshot helper import**

At the top of `src/BorgDock.Tauri/src/App.hero.stories.tsx`, add:

```tsx
import { screenshot } from '../.storybook/screenshot';
```

- [ ] **Step 3: Add `parameters` to each `Hero_*` story**

Edit `src/BorgDock.Tauri/src/App.hero.stories.tsx`. For each story, add a `parameters` field:

```tsx
export const Hero_ReadmeMain: Story = {
  parameters: screenshot({
    output: 'docs/hero/readme-main.png',
    width: 1600,
    height: 1000,
    deviceScaleFactor: 2,
  }),
  decorators: [
    /* …existing decorators unchanged… */
  ],
};

export const Hero_DocFocusList: Story = {
  parameters: screenshot({
    output: 'docs/hero/doc-focus-list.png',
    width: 480,
    height: 800,
    deviceScaleFactor: 2,
  }),
  decorators: [/* … */],
};

export const Hero_DocPrsList: Story = {
  parameters: screenshot({
    output: 'docs/hero/doc-prs-list.png',
    width: 480,
    height: 800,
    deviceScaleFactor: 2,
  }),
  decorators: [/* … */],
};

export const Hero_DocWorkItems: Story = {
  parameters: screenshot({
    output: 'docs/hero/doc-work-items.png',
    width: 480,
    height: 800,
    deviceScaleFactor: 2,
  }),
  decorators: [/* … */],
};
```

Leave existing decorators unchanged. The parameters field is the only addition.

- [ ] **Step 4: Run lint**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run lint 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/App.hero.stories.tsx
git commit -m "screenshot pipeline: tag Hero_* stories with parameters.screenshot"
```

---

## Task 5: Tag prior-phase gallery stories

**Files:**
- Modify: a curated subset — see list below.

Pick one representative story per major window for the marketing gallery. Add `parameters.screenshot` only; do not change story bodies.

- [ ] **Step 1: List candidate stories**

```bash
ls /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/*/[A-Z]*App.stories.tsx
```

Expected output includes (at minimum):
- `flyout/FlyoutApp.stories.tsx`
- `whats-new/WhatsNewApp.stories.tsx`
- `worktree-palette/WorktreePaletteApp.stories.tsx`
- `agent-overview/AgentOverviewApp.stories.tsx`
- `sql/SqlApp.stories.tsx`
- `work-items/WorkItemDetailApp.stories.tsx`
- `file-palette/FilePaletteApp.stories.tsx`
- `file-viewer/FileViewerApp.stories.tsx`
- `work-item-palette/WorkItemPaletteApp.stories.tsx`
- `settings/SettingsApp.stories.tsx`
- `pr-detail/PRDetailApp.stories.tsx`

- [ ] **Step 2: For each window, tag the canonical "Default" story**

For each stories file listed above, add the `screenshot` import at the top:

```tsx
import { screenshot } from '../../.storybook/screenshot';
```

Then add `parameters: screenshot({ ... })` to the `Default` (or equivalent canonical) story. Suggested per-window dimensions and outputs:

| File | Story | Output | Width × Height |
|---|---|---|---|
| `FlyoutApp.stories.tsx` | `Default` | `site/public/screenshots/flyout.png` | 360×600 |
| `WhatsNewApp.stories.tsx` | `Default` | `site/public/screenshots/whats-new.png` | 600×800 |
| `WorktreePaletteApp.stories.tsx` | `Default` | `site/public/screenshots/worktree-palette.png` | 720×600 |
| `AgentOverviewApp.stories.tsx` | `Default` | `site/public/screenshots/agent-overview.png` | 720×800 |
| `SqlApp.stories.tsx` | `Default` | `site/public/screenshots/sql.png` | 1000×700 |
| `WorkItemDetailApp.stories.tsx` | `Default` | `site/public/screenshots/work-item-detail.png` | 800×900 |
| `FilePaletteApp.stories.tsx` | `Default` | `site/public/screenshots/file-palette.png` | 720×600 |
| `FileViewerApp.stories.tsx` | `Default` | `site/public/screenshots/file-viewer.png` | 1000×700 |
| `WorkItemPaletteApp.stories.tsx` | `Default` | `site/public/screenshots/work-item-palette.png` | 720×600 |
| `SettingsApp.stories.tsx` | `Default` | `site/public/screenshots/settings.png` | 800×900 |
| `PRDetailApp.stories.tsx` | `Default` | `site/public/screenshots/pr-detail.png` | 800×900 |

For each, the edit is a single-property addition. Example for `SqlApp.stories.tsx`:

```tsx
export const Default: Story = {
  parameters: screenshot({
    output: 'site/public/screenshots/sql.png',
    width: 1000,
    height: 700,
    deviceScaleFactor: 2,
  }),
  decorators: [/* unchanged */],
};
```

If the canonical story is named something other than `Default` (e.g. `Browse`, `Loaded`, `Open`), use that one. Verify by reading the meta of each file:

```bash
for f in /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/*/[A-Z]*App.stories.tsx; do
  echo "=== $f ==="
  grep -E "^export const" "$f" | head -3
done
```

- [ ] **Step 3: Lint and commit per file or as one batch**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run lint 2>&1 | tail -10
```

Expected: clean.

```bash
git add src/BorgDock.Tauri/src/components/
git commit -m "screenshot pipeline: tag prior-phase canonical stories for gallery"
```

---

## Task 6: WhatsNew banner template

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/whats-new/whats-new.stories.tsx` (or whichever stories file holds the existing WhatsNewApp stories — confirm path first).

Add `Hero_WhatsNewTemplate` — a story scaffold that future per-release banner stories use as a base. Per-release `WhatsNewBanner_*` stories are NOT added in this PR; only the template lives here.

- [ ] **Step 1: Confirm the WhatsNewApp stories file path**

```bash
ls /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/whats-new/*.stories.tsx
```

If multiple files, the per-banner template goes in the one with `WhatsNewApp` stories (the window-level stories from Phase 2).

- [ ] **Step 2: Inspect the existing HeroBanner component**

```bash
grep -rn "HeroBanner\|hero-banner\|data-hero" /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/whats-new/ | head
```

Read the `HeroBanner` component to learn its props (title, body, image slot, etc.). The template story will mount HeroBanner in isolation with stub content, sized to the standard 450×74 banner.

- [ ] **Step 3: Append the template story**

Add to `src/BorgDock.Tauri/src/components/whats-new/whats-new.stories.tsx` (path confirmed in Step 1):

```tsx
import { screenshot } from '../../.storybook/screenshot';
import { HeroBanner } from './HeroBanner'; // adjust import path if different

export const Hero_WhatsNewTemplate: StoryObj = {
  // No parameters.screenshot here — this is the *template*. Per-release
  // stories copy this story and add their own parameters.screenshot:
  //   parameters: screenshot({
  //     output: 'docs/whats-new/X.Y.Z/<slug>.png',
  //     width: 900, height: 148, deviceScaleFactor: 2,
  //   }),
  render: () => (
    <div style={{ width: 450, height: 74, padding: 0 }}>
      <HeroBanner
        title="Feature title"
        body="Short description, one line, fits inside the banner."
        // any other required props
      />
    </div>
  ),
};
```

The exact `HeroBanner` props depend on its actual signature. If it takes a child slot, fill it; if it takes specific named props, use them. Read the component source first.

- [ ] **Step 4: Lint and commit**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run lint 2>&1 | tail -10
git add src/BorgDock.Tauri/src/components/whats-new/whats-new.stories.tsx
git commit -m "screenshot pipeline: Hero_WhatsNewTemplate baseline story"
```

---

## Task 7: First end-to-end capture run

**Files:** none directly modified — generates a batch of PNGs.

- [ ] **Step 1: Build storybook static**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run build-storybook 2>&1 | tail -10
```

Expected: clean build. `storybook-static/` exists.

- [ ] **Step 2: Run the capture script**

```bash
bun run capture-screenshots 2>&1 | tail -30
```

Expected: enumerates ~15 tagged stories (4 from Phase 12 hero + 11 from prior-phase canonical). Writes PNGs:
- `docs/hero/readme-main.png`
- `docs/hero/doc-focus-list.png`
- `docs/hero/doc-prs-list.png`
- `docs/hero/doc-work-items.png`
- `site/public/screenshots/<window>.png` × 11

Final line: `capture-screenshots: 15 written, 0 errors`. If errors > 0, debug per-story failures before proceeding.

- [ ] **Step 3: Eyeball each PNG**

Open each generated PNG in an image viewer (or just `ls -la` and confirm reasonable file sizes — typically 30–200 KB at 2× scale). If any PNG looks blank, fonts unloaded, or animation half-played, the story decorator is at fault — add `freezeAnimations` and re-run.

- [ ] **Step 4: Commit the generated PNGs**

```bash
git add docs/hero/ site/public/screenshots/
git status                # confirm only .png additions
git commit -m "screenshot pipeline: first end-to-end capture run"
```

---

## Task 8: Embed the README hero

**Files:**
- Modify: `README.md` (repo root).

- [ ] **Step 1: Inspect current README**

```bash
head -30 /Users/koenvdb/projects/BorgDock/README.md
```

- [ ] **Step 2: Add the hero image**

Edit `/Users/koenvdb/projects/BorgDock/README.md`. Near the top (after the H1 / project name, before the description), add:

```markdown
![BorgDock — PR sidebar + detail view](docs/hero/readme-main.png)
```

If the README already has a hero or banner, replace it. Keep alt text short and descriptive.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: embed story-driven README hero"
```

---

## Task 9: Retire `screenshot-heroes.mjs`

**Files:**
- Delete: `src/BorgDock.Tauri/scripts/screenshot-heroes.mjs`

The legacy mockup-driven script is superseded. Default action: delete. Keep historical `design/mockups/whats-new-*.html` files (they generated PNGs that are already committed; no rerun needed).

- [ ] **Step 1: Confirm no callers reference the script**

```bash
grep -rn "screenshot-heroes" /Users/koenvdb/projects/BorgDock/ \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=storybook-static 2>&1 | head
```

Expected: only references inside the script itself (and possibly inside this plan / spec / roadmap files). If a `package.json` script or CI workflow references it, update those first to use `capture-screenshots` instead.

- [ ] **Step 2: Delete the file**

```bash
rm /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/scripts/screenshot-heroes.mjs
```

- [ ] **Step 3: Commit**

```bash
git add -A src/BorgDock.Tauri/scripts/screenshot-heroes.mjs
git commit -m "screenshot pipeline: retire screenshot-heroes.mjs (replaced by capture-screenshots)"
```

If `package.json` had a `screenshot-heroes` script, it should have been removed as part of Step 1's cleanup; if not, remove it now and commit separately.

---

## Task 10: Roadmap update

**Files:**
- Modify: `docs/superpowers/specs/storybook-roadmap.md`

- [ ] **Step 1: Mark Hero-shot pipeline as done**

Edit `docs/superpowers/specs/storybook-roadmap.md`. In the "Cross-cutting workstreams (post-catalog)" section, find the `Hero-shot pipeline` bullet and update it to reflect completion. Replace the current bullet with:

```markdown
- ~~**Hero-shot pipeline.**~~ **Done** — `scripts/capture-screenshots.mjs` reads
  `parameters.screenshot` from each Storybook story and writes PNGs to
  repo-relative paths. See `docs/superpowers/specs/2026-05-08-screenshot-pipeline-design.md`
  and `docs/superpowers/plans/2026-05-08-screenshot-pipeline.md`. PR
  _(filled in after PR opens)_.
```

- [ ] **Step 2: Add a Phase-style mock-layer note**

Append to the bottom of the "Mock layer extensions" tracked-list block:

```markdown
> **Screenshot pipeline:** no new mock-layer aliases. Adds `.storybook/screenshot.ts`
> typed parameter helper. Stories opt in via `parameters: screenshot({ output, width,
> height, deviceScaleFactor })`. Capture script (`scripts/capture-screenshots.mjs`)
> reads the static `storybook-static/index.json`, navigates each tagged iframe URL
> in headless Chromium, and writes PNGs. Replaces `scripts/screenshot-heroes.mjs`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/storybook-roadmap.md
git commit -m "screenshot pipeline: roadmap — cross-cutting workstream done"
```

---

## Task 11: Open the PR

**Files:** none.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin screenshot-pipeline
```

- [ ] **Step 2: Switch to personal `gh` account**

```bash
gh auth switch --user borght-dev
gh auth status
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create \
  --repo borght-dev/BorgDock \
  --base master \
  --title "screenshot pipeline: story-driven hero / docs / gallery captures" \
  --body "$(cat <<'EOF'
## Summary
- `scripts/capture-screenshots.mjs` replaces `scripts/screenshot-heroes.mjs`. Reads `parameters.screenshot` from Storybook stories and writes PNGs to repo-relative paths.
- `.storybook/screenshot.ts` typed parameter helper.
- Phase 12 `Hero_*` stories tagged + canonical stories from prior phases tagged for the marketing gallery.
- `Hero_WhatsNewTemplate` baseline added; per-release `WhatsNewBanner_*` stories follow in release PRs.
- README embeds the new story-driven hero.

Cross-cutting workstream from `docs/superpowers/specs/storybook-roadmap.md` — see `docs/superpowers/specs/2026-05-08-screenshot-pipeline-design.md`.

## Test plan
- [ ] `bun run build-storybook` — clean build.
- [ ] `bun run capture-screenshots` — writes ~15 PNGs, 0 errors.
- [ ] Inspect `docs/hero/*.png` and `site/public/screenshots/*.png` — fonts loaded, no half-played animations.
- [ ] README renders the hero image at the top of GitHub's repo page.
- [ ] `bun run test` — baseline test count, all passing.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Switch back to enterprise account**

```bash
gh auth switch --user KvanderBorght_gomocha
gh auth status
```

- [ ] **Step 5: Update roadmap with PR link**

Once the PR URL is known, edit the roadmap entry to replace `_(filled in after PR opens)_` with the actual PR URL, then commit and push:

```bash
git add docs/superpowers/specs/storybook-roadmap.md
git commit -m "screenshot pipeline: roadmap — link PR"
git push
```

---

## Self-review checklist

- [ ] Spec coverage: helper ✓, script ✓, story tagging (Phase 12 hero) ✓, gallery tagging (prior phases) ✓, WhatsNewTemplate ✓, first capture run ✓, README embed ✓, retire heroes script ✓, roadmap update ✓.
- [ ] No placeholders. Field names that depend on the actual codebase (e.g. exact `HeroBanner` props, exact canonical story names per window) come with the precise `grep` command to look them up.
- [ ] Type consistency: `screenshot()` helper signature matches its usages across all tagged stories. The script's `enumerateStories` reads `parameters.screenshot` matching the helper's return shape.

---

## What comes next

- Per-release whatsnew workflow becomes the default starting next BorgDock release. Author adds `WhatsNewBanner_<slug>` stories to `whats-new.stories.tsx`, each with its own `parameters.screenshot.output = 'docs/whats-new/X.Y.Z/<slug>.png'`. The release procedure docs get updated in that release's PR.
- Visual regression follow-up — pixelmatch / Storybook test-runner snapshots layered on top of these committed PNGs.
- Static Storybook hosting follow-up — publish `storybook-static/` somewhere durable so designers can browse the catalog directly.
