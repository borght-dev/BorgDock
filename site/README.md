# BorgDock marketing site

The site at [borgdock.koenvdborght.nl](https://borgdock.koenvdborght.nl): what BorgDock does for
you, a gallery of every screen, the download page and the changelog. It is an Astro 5 site with one
React island (the theme toggle), deployed to GitHub Pages from `master` by
`.github/workflows/deploy-site.yml`.

Every picture and video on the site is captured from BorgDock's own Storybook stories with sample
data. Nothing is drawn by hand, and nothing comes from a real account.

## Commands

Run these from the repo root.

| Command | What it does |
| --- | --- |
| `bun install` | Installs the whole workspace, this site included. |
| `bun run site:dev` | Starts the site at http://localhost:4321. |
| `bun run site:build` | Checks the tokens, type-checks, builds to `site/dist`, then checks every internal link. CI runs exactly this. |
| `bun run site:tokens-check` | Fails when `src/styles/tokens.css` differs from the app's tokens, or a hex colour appears outside it. |
| `bun run site:release` | Refreshes `src/data/release.json` from the latest GitHub release. |
| `bun run site:assets` | Starts Storybook on :6006, regenerates every capture and recording, stops it. Refuses a server already on :6006 unless you pass `-- --reuse`; `-- --screens` or `-- --recordings` runs one half. |

## Layout

```
site/
├── scripts/
│   ├── assets.mjs          # site:assets: boots Storybook, runs both capture scripts, stops it
│   ├── fetch-release.mjs   # site:release: GitHub releases API → src/data/release.json
│   └── check-links.mjs     # last step of site:build: every internal link in dist resolves
├── public/
│   ├── screens/            # <slug>-<light|dark>@2x.png   (generated, committed)
│   ├── recordings/         # <slug>-<theme>.mp4 and .webp poster  (generated, committed)
│   └── whats-new/<version>/  # images for the long-form release posts
└── src/
    ├── data/
    │   ├── site.ts         # app version, release, installers per platform, the freshness check
    │   ├── release.json    # written by site:release
    │   ├── media.ts        # joins design/site/*.json with the files in public/
    │   └── changelog.ts    # parses /CHANGELOG.md, finds What's new posts
    ├── components/
    │   ├── sections/       # Hero, Job (one job with its media), DownloadBlock, ChangelogTeaser
    │   ├── ui/             # Capture, Recording, WindowFrame, BorgDockLogo
    │   ├── DownloadButton.astro, PageHeading.astro, SiteNav.astro, SiteFooter.astro
    │   └── ThemeToggle.tsx # the only hydrated island
    ├── layouts/Layout.astro  # <head>, theme and platform detection before paint
    ├── pages/              # index, features, gallery, download, changelog, whats-new/<version>
    └── styles/
        ├── tokens.css      # GENERATED copy of the app's tokens, do not edit
        └── global.css      # everything else, colours only through tokens
```

## Design tokens and fonts

`src/styles/tokens.css` is a copy of the top-level `:root` (Porcelain) and `.dark` (Workbench
graphite) blocks of `src/BorgDock.Tauri/src/styles/index.css`, plus the motion tokens from
`motion.css`. When the app's tokens change, run `bun scripts/site-tokens-check.ts --write` to copy
them over; `site:build` fails until you do. The theme toggle puts `.dark` on `<html>`, like the app.

Fonts are self-hosted with fontsource, the same packages the app uses: Inter for the interface and
headings, Instrument Sans for long-form prose (`.reading`: the features copy and What's new posts),
JetBrains Mono for code. Nothing loads from Google Fonts.

Motion follows the app: the hero has one entrance, recordings play while they are on screen and
pause when they leave, and everything else is still. With reduced motion on, recordings show their
poster and the entrance is skipped.

## Captures and recordings

Both are driven by manifests in `design/site/` and run against Storybook on port 6006. The scripts
live in the app (`src/BorgDock.Tauri/scripts/`) because they use its Playwright install.

**Screenshots**: `design/site/screens.json`, one entry per screen:

```json
{
  "slug": "focus-board",
  "storyId": "main-window-mainwindow--rail-focus-board",
  "viewport": { "width": 1280, "height": 800 },
  "theme": "both",
  "delay": 2500,
  "selector": "#storybook-root",
  "args": { "section": "workitems" },
  "alt": "Focus as a board with four columns…",
  "page": "Focus",
  "draft": false
}
```

`theme` is `both`, `light` or `dark`; `both` captures twice. `selector` clips the capture to one
element (the Pull requests captures use `main.bd-mainwindow__body` to leave the rail out, so the
text stays readable at the size the site shows it). `storyId` may be
`{ "light": "…", "dark": "…" }` for stories that lock their theme. `args` passes string story args
through the URL. `page` is the gallery filter (`Pull requests`, `Focus`, `Detail`, `Quick review`,
`Tools`). `draft: true` keeps a capture out of the gallery, for a screen that is still being built.
Output: `public/screens/<slug>-<theme>@2x.png`. Run it on its own with
`node scripts/screenshot-manifest.mjs [manifest] [outDir] [--only slug,slug]` from
`src/BorgDock.Tauri`.

**Recordings**: `design/site/recordings.json`, the same fields plus `steps`, `crop` and `fallback`:

```json
{
  "slug": "quick-review",
  "storyId": "focus-quick-review--large-pr-card",
  "theme": "both",
  "fallback": "quick-review-card",
  "steps": [
    { "do": "click", "selector": "role=button[name=\"Review files\"]", "ms": 1500 },
    { "do": "press", "key": "v", "ms": 900 }
  ]
}
```

Steps are `hover`, `click`, `press`, `type`, `wait`, `scroll` and `emit`, with Playwright selectors.
The manifest is validated before a browser starts. The recorder draws a cursor dot so clicks
read on video, trims the page load, crops to the `crop` selector's box when one is given, and writes
`public/recordings/<slug>-<theme>.mp4` (H.264) and a `.webp` poster. H.264 and WebP need an ffmpeg
with libx264 and libwebp on `PATH` (or `FFMPEG=<path>`): the ffmpeg Playwright installs only
encodes VP8 and PNG, so without a full ffmpeg the recorder writes `.webm` and a `.png` poster
instead (and deletes the stale other format), which the site also plays.

On the page, only the current theme's recording is fetched: `Recording.astro` keeps the video URLs
in `data-*` attributes and attaches them for the active theme (again when the theme toggles). The
poster shows until then, and stays under reduced motion. `fallback` names the
capture the site shows while a recording does not exist yet. Run it on its own with
`node scripts/record-stories.mjs [manifest] [outDir] [--only slug,slug]`; drafts are only recorded
when named with `--only`.

The generated files are committed: CI builds the site and never starts Storybook or a browser.

## Releases and the download page

`src/data/release.json` holds the latest published release: tag, date, and each asset's name,
size, URL and SHA-256. `bun run site:release` refreshes it (no token needed; on any error it keeps
the old file). The download page picks the installer for the visitor's platform and lists the rest.

The version badge and the hero show the release version, which is what the button downloads.
The build fails when `/CHANGELOG.md` lists two or more releases newer than `release.json` that are
dated before today, with a message to run `bun run site:release`. An app version ahead of the latest
release (the normal state between a version bump and its release) only prints a warning.

`deploy-site.yml` runs `site:release` before `site:build`, so a deploy always picks up the latest
release. It deploys on pushes to `master` that touch the site, its manifests, the changelog, the
app's version or tokens, and on `release: published`. Pull requests build the site in the `site`
job of `test.yml`.

## Changelog and What's new posts

`/changelog` is built from `/CHANGELOG.md`, the file that also feeds the in-app What's new window.
A release links to a long-form post when `src/pages/whats-new/<version>.astro` exists (dots or
dashes: `2.0.0.astro` and `2-0-0.astro` both count). The home page teaser shows the last three
releases from the same file.

## Voice

Write like the changelog: benefit first, "you", plain verbs, sentence case. No exclamation marks,
no "seamless", no engineering prose. Feature names match the labels in the app: Focus, Pull
requests, Work items, Worktrees, Quick review, Fix with Claude, Open in T3.
