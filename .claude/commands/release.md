# Release PRDock

Create a new release: generate changelog, bump versions, tag, and push. The GitHub Actions workflow handles packaging, uploading, and publishing.

## Arguments

- `$ARGUMENTS` — The version to release (e.g. `1.0.5`). Required.

## Steps

1. **Validate** the version argument is provided and looks like a semver (x.y.z). Abort if not.

2. **Generate changelog** from commits since the previous release tag:
   - Find the previous version tag: `git describe --tags --abbrev=0 HEAD~1` (or use `git tag --sort=-v:refname | head -1` if no tags yet).
   - List commits since that tag: `git log <PREV_TAG>..HEAD --oneline --no-decorate`
   - Write **marketing-style release notes** — don't just copy commit messages. Instead:
     - Summarize related commits into user-facing features and improvements
     - Use clear, benefit-oriented language (e.g. "You can now configure your global hotkey" not "add configurable global hotkey")
     - Group into sections: **New Features**, **Improvements**, **Bug Fixes** (skip empty ones)
     - Each bullet should describe *what changed and why it matters*, not implementation details
     - Omit internal chores (version bumps, CI fixes) unless they affect the user
   - Prepend a new `## <VERSION> — <DATE>` section to `CHANGELOG.md`. Create the file if it doesn't exist. Keep all previous entries intact.
   - Show the generated changelog section to the user for review before continuing.

3. **Bump versions** in ALL of these files (they must all match):
   - `src/PRDock.Tauri/src-tauri/tauri.conf.json` — `"version": "<VERSION>"`
   - `src/PRDock.Tauri/package.json` — `"version": "<VERSION>"`
   - `src/PRDock.Tauri/src-tauri/Cargo.toml` — `version = "<VERSION>"`

   **Why all three?** The Tauri build uses `tauri.conf.json` to name the installer (e.g. `PRDock_1.0.5_x64-setup.exe`). The CI generates `latest.json` from the git tag. If the tag says `v1.0.5` but `tauri.conf.json` says `1.0.4`, the installer is named `1.0.4` but `latest.json` points to `1.0.5` — causing a 404 and breaking auto-updates.

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

7. **Verify signing key**: Remind the user that the `TAURI_SIGNING_PRIVATE_KEY` GitHub secret must be set for auto-updates to work. Without it, the CI generates `latest.json` with an empty signature and the Tauri updater rejects the update. The public key is already configured in `src/PRDock.Tauri/src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.

   To generate a key pair (one-time): `npx tauri signer generate -w ~/.tauri/prdock.key`
   Then add the private key as `TAURI_SIGNING_PRIVATE_KEY` and optionally the password as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in GitHub repo settings > Secrets.

## How the CI release works (`release-tauri.yml`)

- Triggered by `v*` tags (not `wpf-v*`)
- Runs on self-hosted Windows runner
- Builds with `npx tauri build --bundles nsis`
- Signs the installer if `TAURI_SIGNING_PRIVATE_KEY` is set (produces `.nsis.zip` + `.nsis.zip.sig`)
- Uploads all NSIS bundle files to a GitHub release
- Generates `latest.json` for the Tauri updater:
  - `version` and asset URL are derived from the **git tag** (not tauri.conf.json)
  - `signature` comes from the `.sig` file (empty if signing key is missing)
  - The updater endpoint is: `https://github.com/<repo>/releases/latest/download/latest.json`

## WPF release (legacy)

For WPF releases, use the `wpf-v*` tag prefix (e.g. `wpf-v1.0.4`). The WPF version is in `src/PRDock.App/PRDock.App.csproj`. The separate `release.yml` workflow handles WPF builds with Velopack.

## Important

- This command must be run on a Windows machine.
- If any step fails, stop and report the error — do not continue with partial state.
- **Version mismatch is the #1 cause of broken releases.** Always bump all three Tauri config files before tagging.
- The `latest.json` URL pattern is `PRDock_<VERSION>_x64-setup.nsis.zip` (signed) or `PRDock_<VERSION>_x64-setup.exe` (unsigned). The version in the filename comes from `tauri.conf.json`, NOT the git tag.
