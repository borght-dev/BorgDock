# Release BorgDock

Create a new release: generate changelog, bump versions, tag, and push. The GitHub Actions workflow (`release-tauri.yml`) handles packaging, uploading, and publishing.

## Arguments

- `$ARGUMENTS` — The version to release (e.g. `1.0.11`). Required.

## Steps

1. **Validate** the version argument is provided and looks like a semver (x.y.z). Abort if not.

2. **Generate changelog** from commits since the previous release tag:
   - Find the previous version tag (filter to `v*` so legacy `wpf-v*` tags are ignored):
     `git describe --tags --abbrev=0 --match 'v*'`
     If no tag exists yet, fall back to `git tag --sort=-v:refname --list 'v*' | head -1`.
   - List commits since that tag: `git log <PREV_TAG>..HEAD --oneline --no-decorate`
   - Write **marketing-style release notes** — don't just copy commit messages. Instead:
     - Summarize related commits into user-facing features and improvements
     - Use clear, benefit-oriented language (e.g. "You can now configure your global hotkey" not "add configurable global hotkey")
     - Group into sections: **New Features**, **Improvements**, **Bug Fixes** (skip empty ones)
     - Each bullet should describe *what changed and why it matters*, not implementation details
     - Omit internal chores (version bumps, CI fixes, refactors) unless they affect the user
   - Prepend a new `## <VERSION> — <DATE>` section to `CHANGELOG.md` (already exists at repo root). Keep all previous entries intact and match the existing style (bolded feature titles, bullets with em dashes).
   - Show the generated changelog section to the user for review before continuing.

3. **Bump versions** in ALL of these files (they must all match):
   - `src/BorgDock.Tauri/src-tauri/tauri.conf.json` — `"version": "<VERSION>"`
   - `src/BorgDock.Tauri/package.json` — `"version": "<VERSION>"`
   - `src/BorgDock.Tauri/src-tauri/Cargo.toml` — `version = "<VERSION>"`

   **Why all three?** The Tauri build uses `tauri.conf.json` to name the installer (e.g. `BorgDock_1.0.11_x64-setup.exe`). The CI generates `latest.json` from the git tag. If the tag says `v1.0.11` but `tauri.conf.json` says `1.0.10`, the installer is named `1.0.10` but `latest.json` points to `1.0.11` — causing a 404 and breaking auto-updates.

4. **Attach hero images** for any `### New Features`, `### Improvements`, or bulletted `### Bug Fixes` entries that start with `**Bold Title**`:
   - Heroes are **real screenshots captured from Storybook** (large, ~16:10 — not hand-mocked banners). To produce them:
     1. Author `design/whats-new/<VERSION>.heroes.json` — an array of `{ slug, storyId, viewport?, theme?, delay?, selector?, seedIdle?, emit? }`. Get story ids from `http://localhost:6006/index.json` while Storybook runs. Every window/section has a story catalog; the main window (Focus/PRs/Work Items) is `src/components/layout/MainWindow.stories.tsx`.
     2. Start Storybook: `cd src/BorgDock.Tauri && node_modules/.bin/storybook dev -p 6006 --no-open`.
     3. Capture: `cd src/BorgDock.Tauri && node scripts/screenshot-stories.mjs <VERSION>` → writes `docs/whats-new/<VERSION>/<slug>.png` at 2× in dark theme (the script forces dark so windows that self-bootstrap their theme stay consistent).
   - Reference each from the bullet: `- **Bold Title** — Description. ![alt](whats-new/<VERSION>/<slug>.png)`.
   - To demote a bullet that has no image ready, strip the `**Bold Title** — ` prefix so the bullet joins the compact "Also fixed" list and requires no image.
   - Voice: emulate the Home Assistant release blog — warm, benefit-first ("you can now…"), per-feature, not root-cause engineering prose.

5. **Validate** the release note by running the strict validator:
   ```
   cd src/BorgDock.Tauri && bun run validate-release -- <VERSION>
   ```
   If any highlight is missing a hero image, the validator prints `file:line` with a remediation hint and exits non-zero. Fix and re-run until it prints `OK`.

6. **Commit** the version bump, changelog, hero images, and the regenerated module:
   ```
   git add CHANGELOG.md \
     src/BorgDock.Tauri/src-tauri/tauri.conf.json \
     src/BorgDock.Tauri/package.json \
     src/BorgDock.Tauri/src-tauri/Cargo.toml \
     src/BorgDock.Tauri/src/generated/changelog.ts \
     docs/whats-new/<VERSION>
   git commit -m "chore: release <VERSION>"
   ```
   The hero PNGs under `docs/whats-new/<VERSION>/` are the committed **source** and **must** be in this commit — the CI build's changelog plugin (`syncImages`) errors out (`references missing image`) and the whole build fails if `CHANGELOG.md` references an image that isn't committed. The plugin regenerates `src/generated/changelog.ts` and copies the heroes into `public/whats-new/` (which is **gitignored**), so don't stage `public/whats-new/`; committing `changelog.ts` just keeps local diffs clean.

7. **Tag and push**:
   ```
   git tag v<VERSION>
   git push && git push origin v<VERSION>
   ```

8. **Print status**: Tell the user the tag has been pushed and the GitHub Actions workflow (`release-tauri.yml`) will automatically build, package (NSIS), upload assets, and generate `latest.json`. Provide the URL: `https://github.com/<repo>/actions` so they can monitor progress.

9. **Verify signing key**: The `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub secrets must exist on the repo. Without them, the CI emits `latest.json` with an empty signature and the Tauri updater rejects the update. The public key is committed in `src/BorgDock.Tauri/src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.

   To regenerate (if the key is lost): `npx tauri signer generate -w ~/.tauri/borgdock.key`, then `gh secret set TAURI_SIGNING_PRIVATE_KEY < .../borgdock.key` and update the pubkey in `tauri.conf.json`.

## How the CI release works (`release-tauri.yml`)

- Triggered by `v*` tags only.
- Runs on `windows-latest` (GitHub-hosted) with `tauri-apps/tauri-action@v0`.
- Builds with `--bundles nsis`.
- With signing secrets set, the NSIS installer is signed directly (v2 updater format): produces `BorgDock_<VERSION>_x64-setup.exe` + `BorgDock_<VERSION>_x64-setup.exe.sig`.
- tauri-action creates the GitHub release, uploads all bundle artifacts + signatures, and generates `latest.json` automatically.
- The `latest.json` URL points at the signed `.exe` installer; the updater plugin downloads and runs it directly.
- The updater endpoint configured in `tauri.conf.json` is:
  `https://github.com/<repo>/releases/latest/download/latest.json`

## Important

- If any step fails, stop and report the error — do not continue with partial state.
- **Version mismatch is the #1 cause of broken releases.** Always bump all three Tauri config files before tagging.
- The asset filename pattern is `BorgDock_<VERSION>_x64-setup.exe` (+ `.sig` when signed). The version in the filename comes from `tauri.conf.json`, NOT the git tag — so they must match.
- **Hero images are required for all current-release highlights.** Running `bun run validate-release -- <VERSION>` before tagging catches missing images. Historical versions are frozen; missing images there render a gradient fallback at runtime.
