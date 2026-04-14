# "What's New?" experience — Design spec

Date: 2026-04-14
Status: Approved via brainstorming; implementation plan to follow
Reference mockup: `.superpowers/brainstorm/1042-1776174854/content/whats-new-proper-v2.html`
Reference redesign (user's aesthetic direction): `design/mockups/prdock_whats_new_redesign.html`

## Problem

Users who auto-update PRDock don't discover the features we ship. The current process (`/release` writes CHANGELOG.md, GitHub Actions tags and publishes) ends with users getting a new binary with no in-app announcement of what changed. We need an in-app "What's new?" surface that makes shipped work visible without requiring the user to go read the GitHub release.

## Goals

1. After an update containing user-facing changes, PRDock proactively shows what shipped in the versions the user skipped.
2. Users can re-open the same experience at any time.
3. Zero additional authoring burden in the normal case: CHANGELOG.md stays the canonical source. Optional richer content (hero images) is added per-release when wanted.
4. Pure bugfix releases do not spam the user with popups.

## Non-goals

- Telemetry / "which highlights did users view".
- Localization.
- Inline screenshot lightbox / zoom.
- Editing release notes from inside PRDock.

## Summary of decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Trigger | **Auto + manual.** Auto-opens once after an update that meets the gate. Always reachable from tray menu, Command Palette, and Settings. |
| Content source | **Hybrid** — CHANGELOG.md is canonical; optional per-bullet `![](...)` image for hero art. |
| Skipped releases | **All missed versions** shown as accordion; newest expanded, older collapsed. |
| Surface | **Separate resizable Tauri window** (`whats-new.html`, mirrors the PR detail pop-out pattern). |
| Window size | **520 × 640**, resizable. |
| Auto-open gate | Fire **only when at least one missed release has a `### New Features` or `### Improvements` section**. Bugfix-only releases stay quiet. Manual entry always works. |
| Aesthetic | Restrained purple-slate matching existing PRDock components; slim 74px hero banners per highlight; left-rail version grouping; inline kind badge + title. |

## User stories

1. As a user who just updated PRDock, I want to know immediately what's new so I can try it.
2. As a user who dismissed the popup too quickly, I want a way to reopen it.
3. As a user who was on an old version and leap-frogged several releases, I want all missed releases visible, not just the latest.
4. As a user who doesn't want popups at all, I want a way to permanently disable the auto-open.
5. As the release author running `/release`, I want writing a changelog entry to keep feeling the same as today — no new required frontmatter.

## Architecture

Three cleanly-separated pieces.

### A. Build-time parser

`scripts/build-changelog.ts` (Node + TypeScript). Packaged as a Vite plugin registered in `vite.config.ts`. It runs on Vite's `buildStart` hook (so both `vite build` and `vite dev` trigger it) and also in response to CHANGELOG.md / `docs/whats-new/**` changes via Vite's watcher, so authors see updates in dev without restarting. Reads `CHANGELOG.md`, copies hero image files, emits a typed TS module.

Input: `E:\PRDock\CHANGELOG.md` and `docs/whats-new/<version>/*` image sources.

Output:
- `src/PRDock.Tauri/src/generated/changelog.ts` — a typed `export const RELEASES: Release[]`.
- `src/PRDock.Tauri/public/whats-new/<version>/*` — copies of referenced hero images so Vite serves them at `/whats-new/<version>/<name>.png`.

`public/whats-new/` is gitignored (generated) but `docs/whats-new/` is committed (the authored sources).

### B. The window

A new Vite entry + Tauri window, modeled on the PR detail pop-out.

- `src/PRDock.Tauri/whats-new.html` — Vite entry HTML.
- `src/PRDock.Tauri/src/whats-new-main.tsx` — React root; reads `?version=` query param for deep-link behavior.
- `src/PRDock.Tauri/src-tauri/src/lib.rs` — new `open_whats_new_window` Tauri command that focuses existing window or creates one using `WebviewWindowBuilder` at `520 × 640`, resizable, with a minimum size of `480 × 480`. Reuses the same plumbing as `open_pr_detail_window`.

### C. Launcher hook

`src/PRDock.Tauri/src/hooks/useWhatsNew.ts` is called once from `App.tsx`. It:

1. Reads the app version via `getVersion()` from `@tauri-apps/api/app`.
2. Reads `lastSeenVersion` and `autoOpenDisabled` from `whats-new-state.json` (tauri-plugin-store).
3. On first run of this feature (no `lastSeenVersion` stored), silently seeds `lastSeenVersion = currentVersion` to avoid showing a backlog to existing users.
4. Computes `missedReleases = RELEASES.filter(r => semverGt(r.version, lastSeenVersion) && semverLte(r.version, currentVersion))`.
5. If `!autoOpenDisabled && missedReleases.some(r => r.autoOpenEligible)` → invokes `open_whats_new_window`.
6. Exports `openWhatsNew(version?: string)` for manual entry points.

Semver comparison is inline (~10 lines) — versions are strict `x.y.z`; no library needed.

## Data model

Generated by the build step into `src/generated/changelog.ts`:

```ts
export type Kind = 'new' | 'improved' | 'fixed';

export type Highlight = {
  kind: Kind;
  title: string;
  description: string;         // markdown body, no image
  hero: { src: string; alt: string } | null;   // null → gradient fallback
  keyboard?: string;           // e.g. "Ctrl+Shift+W" if detected
};

export type Release = {
  version: string;             // "1.0.11"
  date: string;                // "2026-04-14"
  summary: string;             // auto-generated one-liner for header + collapsed row
  highlights: Highlight[];
  alsoFixed: string[];         // plain markdown for bulleted list
  autoOpenEligible: boolean;   // precomputed: ≥1 highlight in 'new' or 'improved'
};

export const RELEASES: Release[]; // sorted newest first
```

### Field derivation

- `version`, `date` — parsed from `## 1.0.11 — 2026-04-14` heading.
- `highlights` — every bullet in `### New Features` and `### Improvements`. `kind` is `'new'` for the former, `'improved'` for the latter. Bullets in `### Bug Fixes` become highlights with `kind='fixed'` only if they start with a `**bold title**` (feature-style); otherwise they fall to `alsoFixed`.
- `title` — the `**bolded text**` at the start of a bullet.
- `description` — everything after the `— ` separator, with the `![](...)` image lifted out.
- `hero.src` — the first markdown image `![alt](path)` anywhere in the bullet is extracted as the hero and removed from the description. Additional images in the same bullet are treated as regular inline markdown in the description. Resolved to its public URL; `null` if no image.
- `hero.alt` — the image's markdown alt text, or the highlight title if empty.
- `keyboard` — if the description contains `` `⌘⇧W` ``, `` `Ctrl+Shift+W` ``, or similar kbd-like backtick spans, the first is extracted so the renderer can style it as a `<kbd>` chip. Optional, default null.
- `alsoFixed` — every bullet under `### Bug Fixes` that does not start with a `**bold title**`, as plain markdown.
- `summary` — auto-generated:
  - If 0 highlights → `''` (won't display; autoOpenEligible is false).
  - If 1 → the one title + period.
  - If 2 → `"{A} and {B}."`
  - If 3+ → `"{A}, {B}, and {C_or_more}."` (Oxford comma; truncate at 3 with "and more" when >3).
- `autoOpenEligible` — `highlights.some(h => h.kind === 'new' || h.kind === 'improved')`.

## CHANGELOG.md authoring convention

Existing format is preserved. The only new convention is an optional image per bullet.

```md
## 1.0.11 — 2026-04-14

### New Features

- **Close PRs from the detail panel** — Hit `Ctrl+Shift+W` in the detail panel — the list auto-refreshes after it closes. ![](whats-new/1.0.11/close-pr.png)

### Improvements

- **Build-integrity suite** — New automated checks verify window entry points and asset bundling stay intact across releases. ![](whats-new/1.0.11/build-integrity.png)

### Bug Fixes

- **Tokens survive reboots** — GitHub and Azure DevOps tokens now live in Windows Credential Manager. ![](whats-new/1.0.11/keyring.png)
- SQL queries authenticate with the password hydrated from the keychain.
- Settings flyout no longer loops via `WorktreePruneDialog`.
```

Notes:
- Bullets under Bug Fixes become full highlight cards *only* when they start with `**title**`. Plain bullets stay in the compact "Also fixed" list.
- Image path is relative and sourced from `docs/whats-new/<version>/`. The build script copies it into `public/whats-new/<version>/` and rewrites the path to the public URL.
- Backtick spans that look like shortcuts (`Ctrl+…`, `Cmd+…`, `⌘…`, `⇧…`) are auto-extracted as a `keyboard` hint.

### Build-time validation

The build script fails the build when:
- CHANGELOG.md cannot be parsed (unknown heading, no date, malformed version).
- **Any highlight** in the current release (regardless of kind) has no hero image. Historical releases are frozen — missing images there render a gradient fallback without erroring.
- An image path referenced from `docs/whats-new/<version>/` does not exist on disk.

The current release is determined from `src/PRDock.Tauri/package.json`'s `version` field. Validation errors include file:line and a remediation hint ("Add `docs/whats-new/1.0.11/close-pr.png` or remove the `**bold title**` from bullet to demote it to the Also-fixed list.").

## Version tracking and gate

State persists to `whats-new-state.json` via `@tauri-apps/plugin-store`:

```ts
{
  lastSeenVersion: string | null,
  autoOpenDisabled: boolean,
}
```

Auto-open decision, run once on app mount:

```
if no lastSeenVersion stored → set to currentVersion, done (silent seed)
else if autoOpenDisabled → done
else if any missed release is autoOpenEligible → open window
```

When the window closes via the "Got it" button or the native close control:
- Set `lastSeenVersion = currentVersion`.

When the user toggles "Don't auto-open again":
- Set `autoOpenDisabled = true` AND set `lastSeenVersion = currentVersion`.

Manual entry points (tray menu, Command Palette, Settings) do not mutate state — they're allowed any time.

## UI — window contents

Reference mockup: `whats-new-proper-v2.html` in the brainstorm session directory. Both light and dark themes rendered side by side.

### Structure (top to bottom)

1. **Chrome** — platform-standard title bar with "What's new in PRDock" title. No custom controls.
2. **Release head** — padding 22/24/14/24:
   - Eyebrow row: "RELEASE NOTES" left, "N versions behind" right.
   - H1: "What's new in **1.0.11**" (version in accent violet, weight 600, tabular numerals).
   - One-line summary (the auto-generated `summary`).
3. **Scrollable accordion** — padding 0/24/14/24:
   - Each `<section>` is a version block.
   - Expanded header: caret ▾, version, "Current" pill, right-aligned date.
   - Expanded body: indented by a 2px violet rail (`rgba(124,106,246,.22)`), padding-left 16px, margin-left 3px. Contains highlights then the "Also fixed" list.
   - Collapsed header: caret ▸ (rotated -90°), dimmed version, short summary, right-aligned date.
4. **Footer** — padding 12/24:
   - Left: "Don't auto-open again" checkbox.
   - Right: "View on GitHub →" link, primary violet "Got it" button.

### Highlight card anatomy

- **Hero banner** — 74px tall, `border-radius: 7px`, `border: 1px solid var(--border-subtle)`, margin-bottom 10px.
  - Background: a gradient selected based on the `kind` (violet-dominant, never photographic, never stock-blue).
  - Foreground: if `hero.src` exists, shown as a `<img>` with `object-fit: cover`. Otherwise a kind-appropriate gradient fallback with a small icon (no fake UI fragments in the fallback — those only exist in authored screenshots).
- **Kind badge + title row** — inline, flex, gap 8px, wrap.
  - Kind badge: 10px text, uppercase, 0.04em tracking, padding 2px 7px, border-radius 4px.
  - Title: 14px, weight 500, tight letter-spacing.
- **Description** — 13px, color `--text-secondary`, line-height 1.55. Markdown rendered via existing `react-markdown` pipeline so `<code>`, links, and extracted `<kbd>` chips all work.

### Kind color mapping

| Kind | Light fg / bg / border | Dark fg / bg / border | Source section |
|---|---|---|---|
| New | `#2E8E78` / `rgba(59,166,142,.08)` / `rgba(59,166,142,.22)` | `#7DD3C0` / `rgba(125,211,192,.07)` / `rgba(125,211,192,.20)` | `### New Features` |
| Improved | `#8A5F06` / `rgba(176,125,9,.08)` / `rgba(176,125,9,.22)` | `#F5B73B` / `rgba(245,183,59,.06)` / `rgba(245,183,59,.20)` | `### Improvements` |
| Fixed | `#6655D4` / `rgba(124,106,246,.08)` / `rgba(124,106,246,.22)` | `#B8B0F8` / `rgba(184,176,248,.06)` / `rgba(184,176,248,.20)` | `### Bug Fixes` (title-bearing bullets) |

All other colors, borders, and spacing come from the existing PRDock tokens in `src/PRDock.Tauri/src/styles/index.css`.

### Deep-link behavior

The window honors `?version=1.0.11` in the URL:
- If present, that version is the only one expanded; the window scrolls to it.
- Absent, default expansion is the newest release among missed-or-current; older versions are collapsed.

## Components

All new, under `src/PRDock.Tauri/src/components/whats-new/`:

- `WhatsNewApp.tsx` — root layout (release-head, scroll, footer).
- `ReleaseAccordion.tsx` — one version block (expanded or collapsed).
- `HighlightCard.tsx` — hero banner + kind-badge-title row + description.
- `HeroBanner.tsx` — renders `hero.src` when present, else the gradient+icon fallback keyed on `kind`.
- `AlsoFixedList.tsx` — compact bullet list with markdown rendering.
- `useReleasesToShow.ts` — returns `{ releases, expandedByDefault, summary, countBehind }` given `RELEASES`, `currentVersion`, and optional `?version=` param.

Styling is Tailwind v4 utilities on top of existing CSS variable tokens. No new CSS tokens required beyond the three kind-color triples above, which go in `index.css` as `--color-whats-new-*-fg/bg/border`.

## Manual entry points

Three, all calling `openWhatsNew()` (no argument → default view; with version → deep-link):

1. **Tray menu** — a "What's new…" item added alongside the existing tray items in `src-tauri/src/lib.rs`.
2. **Command Palette** — a `whats-new` action in `palette-main.tsx`.
3. **Settings → Update section** — a "View release notes" button next to "Check for updates" in `components/settings/UpdateSection.tsx`.

## Error handling

Minimal by design. Only handle what can actually go wrong.

| Situation | Behavior |
|---|---|
| Missing hero on a historical release | Render gradient fallback keyed on kind. No error surfaced. |
| Missing hero on the *current* release | Build fails with file:line + remediation. |
| `RELEASES` is empty | Window renders empty state ("No release notes yet."). `autoOpenEligible` is always false; window never auto-opens. |
| Plugin-store read fails | Treat as first run — seed `lastSeenVersion = currentVersion`; no auto-open. |
| Hero image 404 at runtime | `<img>` falls back to the gradient placeholder via `onerror`. |
| Malformed semver in CHANGELOG | Build fails. |

## Testing

- `scripts/__tests__/build-changelog.test.ts` — Vitest. Parser against fixture CHANGELOGs; snapshot the generated TS; assert validation errors for malformed input and missing images on the current release.
- `components/whats-new/__tests__/*.test.tsx` — Accordion toggle, deep-link `?version=` expansion, gradient fallback when `hero` is null, kbd-chip extraction, "Got it" writes `lastSeenVersion`, "Don't auto-open again" writes both flags.
- `hooks/__tests__/useWhatsNew.test.ts` — First-run seed (no auto-open), bugfix-only release does not auto-open, new-features release auto-opens once, autoOpenDisabled suppresses.
- `__tests__/build-integrity` — extend to assert `whats-new.html` is present in the build output and `/whats-new/<currentVersion>/` contains each referenced image.

## Release-author workflow

The `/release` slash command stays the same except:

1. For every bullet that should become a highlight card (starts with `**title**`), add a hero image under `docs/whats-new/<version>/<slug>.png`.
2. Reference it from the bullet as `![alt](whats-new/<version>/<slug>.png)`.
3. Run `/release <version>`. `/release` calls `npm run build`, and the build-time validator fails fast if any current-release highlight is missing its image — before the git tag is pushed, so there's no half-released state.

If the author hasn't prepared an image for a change, they demote the bullet from `**bold title** — description` to plain `description` under Bug Fixes, which routes it to the compact "Also fixed" list and requires no image.

## Rollout

Ship the whole feature in one release. The first-run seed (setting `lastSeenVersion = currentVersion` when no prior state is stored) means no existing user sees a backlog popup — they'll first see "What's new" after the *next* release that meets the gate. New installs behave the same way: the seed runs on first launch before any window could open.

## Out of scope (future follow-ups)

- Image lightbox / zoom.
- Video hero content.
- Per-highlight "Try it" deep links into PRDock features.
- Release notes translation.
- Opting in to screenshots via the sidebar when the user clicks a highlight.

## Open questions

None at spec time.
