# Release PRDock

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
   - `src/PRDock.Tauri/src-tauri/tauri.conf.json` — `"version": "<VERSION>"`
   - `src/PRDock.Tauri/package.json` — `"version": "<VERSION>"`
   - `src/PRDock.Tauri/src-tauri/Cargo.toml` — `version = "<VERSION>"`

   **Why all three?** The Tauri build uses `tauri.conf.json` to name the installer (e.g. `PRDock_1.0.11_x64-setup.exe`). The CI generates `latest.json` from the git tag. If the tag says `v1.0.11` but `tauri.conf.json` says `1.0.10`, the installer is named `1.0.10` but `latest.json` points to `1.0.11` — causing a 404 and breaking auto-updates.

4. **Commit** the version bump and changelog:
   ```
   git add src/PRDock.Tauri/src-tauri/tauri.conf.json src/PRDock.Tauri/package.json src/PRDock.Tauri/src-tauri/Cargo.toml CHANGELOG.md
   git commit -m "chore: release <VERSION>"
   ```

5. **Tag and push**:
   ```
   git tag v<VERSION>
   git push && git push origin v<VERSION>
   ```

6. **Print status**: Tell the user the tag has been pushed and the GitHub Actions workflow (`release-tauri.yml`) will automatically build, package (NSIS), upload assets, and generate `latest.json`. Provide the URL: `https://github.com/<repo>/actions` so they can monitor progress.

7. **Verify signing key**: Remind the user that the `TAURI_SIGNING_PRIVATE_KEY` GitHub secret must be set for auto-updates to work. Without it, the CI generates `latest.json` with an empty signature and points at the `.exe` URL instead of the signed `.nsis.zip` — the Tauri updater will reject the update. The public key is already configured in `src/PRDock.Tauri/src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.

   To generate a key pair (one-time): `npx tauri signer generate -w ~/.tauri/prdock.key`
   Then add the private key as `TAURI_SIGNING_PRIVATE_KEY` and optionally the password as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in GitHub repo settings > Secrets.

## How the CI release works (`release-tauri.yml`)

- Triggered by `v*` tags only (`wpf-v*` doesn't match because the pattern requires the tag to start with `v`).
- Runs on a self-hosted Windows runner.
- Builds with `npx tauri build --bundles nsis`.
- Signs the installer if `TAURI_SIGNING_PRIVATE_KEY` is set (produces `.nsis.zip` + `.nsis.zip.sig`).
- Uploads all NSIS bundle files to a GitHub release created via `gh release create`.
- Generates `latest.json` for the Tauri updater:
  - `version` comes from the **git tag** (stripped of the `v` prefix), not `tauri.conf.json`.
  - `signature` comes from the `.sig` file (empty string if signing key is missing).
  - `url` points at `PRDock_<VERSION>_x64-setup.nsis.zip` (signed) or `PRDock_<VERSION>_x64-setup.exe` (unsigned).
  - The updater endpoint configured in `tauri.conf.json` is:
    `https://github.com/<repo>/releases/latest/download/latest.json`

## Important

- If any step fails, stop and report the error — do not continue with partial state.
- **Version mismatch is the #1 cause of broken releases.** Always bump all three Tauri config files before tagging.
- The asset filename pattern is `PRDock_<VERSION>_x64-setup.nsis.zip` (signed) or `PRDock_<VERSION>_x64-setup.exe` (unsigned). The version in the filename comes from `tauri.conf.json`, NOT the git tag — so they must match.
- The self-hosted Windows runner must be online and picked up the job; if the Actions run stays queued, check the runner.
