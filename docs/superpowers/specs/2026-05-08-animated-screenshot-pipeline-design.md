# Animated Screenshot Pipeline — Design

**Status:** Spec. Phase A implementation in progress on branch `animation-pipeline-A` (PR forthcoming).
**Sibling spec:** `2026-05-08-screenshot-pipeline-design.md` — the static screenshot pipeline this extends.
**Roadmap entry:** TBD; will be added under "Cross-cutting workstreams (post-catalog)" after Phase A merges.

## Intro

Extends the story-driven screenshot pipeline with **animated GIFs**. Stories with a `play` function and a new `parameters.animation` block get captured as GIFs that show the rendered story progressing through interactions over time. Same flow as static screenshots: tag a story, run the script, GIF lands at the declared path.

## Why

Static images show a moment. Animations show the *experience*. The user-visible flows in BorgDock — clicking through PR Detail tabs, opening a file palette and typing, watching agent state tick over — require motion to convey. Hand-recorded screencasts drift from the real UI; story-driven captures stay in sync with code.

## Non-goals

- Real video files (mp4/webm). GIF only — embeddable in Markdown / GitHub README without a player.
- Cross-OS recording. Single Chromium run, like the static pipeline.
- Sound. GIFs don't carry audio.
- Replacing static screenshots. The two coexist; `parameters.screenshot` and `parameters.animation` are independent.

## Phasing

This spec lands in five PRs to keep review surface manageable:

- **Phase A** — pipeline foundation. `animation()` helper, frame-capture loop, ffmpeg-static encode, preflight, one trivial test animation. (`animation-pipeline-A` branch.)
- **Phase B** — 9 easy single-window animations. Single `<App />` or single window-app component, no cross-window choreography.
- **Phase C** — 4 medium single-window animations. Multi-step interactions or scroll/transition behavior.
- **Phase D** — 3 cross-window composed scenes. Two windows mounted in one canvas, second slides in on cue.
- **Phase E** — global hotkey toggle (1 animation, may be punted).

Each phase = own branch, own PR. Branches chain: master → screenshot-pipeline → animation-pipeline-A → animation-pipeline-B → ...

## Constraints

- **GIF output only.** WebP rejected because GitHub's repo front page doesn't render animated webp consistently.
- **ffmpeg via `ffmpeg-static` npm package.** Bundles the platform binary; no system install required.
- **Story-side API symmetric to `screenshot()`.** Stories opt in via:
  ```ts
  parameters: animation({
    output: 'docs/anim/<slug>.gif',
    width: 800,
    height: 900,
    fps: 12,                    // capture cadence
    duration: 6000,             // total ms (used as fallback if play function returns earlier)
    deviceScaleFactor?: 2,
    waitFor?: string,           // optional CSS selector; capture starts after this resolves
  })
  ```
- **`play` function drives the animation.** Standard Storybook `play` — uses `within(canvasElement)` + `userEvent` from `'storybook/test'`. The pipeline starts frame capture before `play` runs, stops when `play` resolves (or when `duration` elapses, whichever is later).
- **Frame storage is ephemeral.** The capture script writes frames to a temp dir, encodes, then deletes the temp dir. Only the GIF is committed.
- **Output paths declared per-story.** Same convention as `screenshot()`. `docs/anim/<slug>.gif` for documentation animations, `site/public/anim/<slug>.gif` for the marketing site.
- **Static and animated stories live side-by-side.** A single story may carry both `parameters.screenshot` AND `parameters.animation` — captured by both passes.

## Architecture

### Helper (Phase A)

`.storybook/screenshot.ts` (existing file, extended):

```ts
export interface AnimationParameters {
  output: string;
  width: number;
  height: number;
  fps?: number;                // default 12
  duration?: number;           // default 5000 ms
  deviceScaleFactor?: number;  // default 2
  waitFor?: string;
}

export function animation(params: AnimationParameters): {
  animation: AnimationParameters;
} {
  return { animation: params };
}
```

### Capture script (Phase A)

`scripts/capture-screenshots.mjs` (existing) — extend the probe-then-capture flow:

```
For each story:
  navigate to iframe
  read parameters.screenshot AND parameters.animation
  if either is set, capture (one or both)
```

For animation capture:

1. Set viewport from `parameters.animation`.
2. Navigate to story.
3. `await waitFor` selector if set.
4. Start interval-based screenshot loop (`page.screenshot()` every `1000/fps` ms).
5. Run the story's `play` function.
6. Stop the loop when `play` resolves OR `duration` elapses (whichever is later).
7. Pipe collected frames through ffmpeg with a two-pass palette generation:
   ```
   ffmpeg -framerate <fps> -i frame_%04d.png \
     -filter_complex "[0:v] palettegen=stats_mode=full" -y palette.png
   ffmpeg -framerate <fps> -i frame_%04d.png -i palette.png \
     -filter_complex "[0:v][1:v] paletteuse=dither=bayer:bayer_scale=5" \
     -loop 0 -y <output>.gif
   ```
8. Write GIF to declared output path; delete frame temp dir.

`page.screenshot()` at 12 fps for 6 seconds = 72 frames. Each frame ~100-300 KB at 2× scale; total ~10-20 MB temp data. Encoded GIF: 100-300 KB.

### Story-side play helpers (Phase B+)

Each animation story uses Storybook's standard play API:

```ts
import { within, userEvent } from 'storybook/test';

play: async ({ canvasElement }) => {
  const c = within(canvasElement);
  await userEvent.click(await c.findByRole('tab', { name: /files/i }));
  await new Promise(r => setTimeout(r, 800));
  // ... more interactions
}
```

A small helper `pause = (ms) => new Promise(r => setTimeout(r, ms))` lives in `.storybook/play-helpers.ts` (new file) for readability.

### Cross-window composition (Phase D)

For animations like "click PR card → PR Detail window opens," the existing `HeroCompositionFrame` pattern is extended:

- Both windows mount in one canvas.
- The second window starts off-screen via CSS transform.
- The play function: clicks the PR card on the sidebar, the click handler is mocked to flip a CSS class on the second-window container that runs the slide-in transition.

This requires a tiny in-decorator class-toggling helper exposed on `window.__BORGDOCK_ANIM__` so the mock invoke for `open_pr_detail_window` can trigger it.

## The 17 scenarios (Phases B–E)

Phase B (easy single-window):

1. **PR Detail tab carousel** — Overview → Files → Checks → Discussion (click each tab, pause 800ms).
2. **File palette open + fuzzy search** — type "react", scroll results.
3. **Settings sidebar section switch + toggle** — click 3 sections, toggle one switch.
4. **Worktree palette + Enter-to-launch-terminal** — open, highlight a row, press Enter.
5. **Setup wizard step-through** — Auth → Repos → Done.
6. **Agent Overview state ticking** — emit a series of progress events, watch states change.
7. **Work item palette browse → search → mine sections** — three section switches.
8. **Focus tab → Start Quick Review** — click button, overlay opens.
9. **Merge toast undo countdown → merge fires** — toast appears, countdown ticks down.

Phase C (medium):

10. **PR Detail → Checkout panel slides in** — click Checkout button, panel transitions in.
11. **File viewer diff overlay + scrolling** — open file, toggle diff overlay, scroll content.
12. **Checks tab expand → Send to Claude Code** — click failed check row, action button reveals.
13. **Hover PR card → context menu / pill bar** — `userEvent.hover` triggers reveal animation.

Phase D (cross-window):

14. **Sidebar PR card click → PR Detail opens** — composed; PR Detail slides in from right.
15. **Work item palette → Work Item Detail opens** — composed; Work Item Detail slides in.
16. **Sidebar → SQL hotkey opens SQL window** — composed; play function calls the hotkey-handler mock; SQL window slides in.

Phase E:

17. **Global hotkey toggling sidebar in/out** — likely faked via CSS slide because Storybook iframes don't get OS-level focus events. May be punted if the fake doesn't read as authentic.

## Tooling

- **`ffmpeg-static`** — new dev dep (~100 MB on disk, dev-only). Provides ffmpeg binary path via `import ffmpegPath from 'ffmpeg-static'`.
- **Existing**: `@playwright/test`, `serve-handler`, `storybook/test` (for play helpers).

## Risks

1. **Frame capture rate isn't deterministic.** `page.screenshot()` takes ~30-100 ms each. At 12 fps target, the actual cadence may slip on slower machines. Mitigation: log captured frame count; if significantly under target, surface a warning. The encoded GIF still plays at the declared fps even if frames captured below it (ffmpeg interpolates).
2. **GIF file sizes can balloon for animations >5s or >800px wide.** Mitigation: per-story `fps` and `duration` knobs already exist; recommend defaults of 12 fps and ≤6 s. Document size budget in the spec.
3. **`ffmpeg-static` binary is platform-specific.** `bun install` should download the right one for the host platform. Verify on macOS/Linux/Windows before relying.
4. **`play` function failures during capture.** Pipeline currently has no story-fault tolerance for `play`. If a story's play throws mid-animation, the script must catch + log + skip the GIF, not crash the whole run.
5. **Cross-window composed scenes are fragile.** The slide-in CSS hack for "second window opens" is decorator-only — if production refactors window-open to a different invoke command, the mock-class-toggle hook breaks silently (no GIF, no error). Documented; reviewer should manually verify cross-window animations after merge.

## Acceptance (per phase)

**Phase A:**
- `animation()` helper exported from `.storybook/screenshot.ts`
- Capture script handles `parameters.animation`
- ffmpeg-static integrated; preflight check warns if binary missing
- One trivial test animation (e.g., a simple PR Detail tab click) produces a valid GIF
- `bun run capture-screenshots` clean

**Phase B–E:**
- Each phase ships its declared animations
- All GIFs render correctly when embedded in Markdown
- Captures regenerate from `bun run capture-screenshots --rebuild`
- Site `/gallery` (or a new `/animations` page) embeds the most representative ones

## What comes next

- Phase A implementation: `animation-pipeline-A` branch, separate PR.
- After Phase A merges: Phase B branch cut, plan written, executed.
- After all phases: site updated to embed the most demonstrative animations on `/gallery` and the home page.
