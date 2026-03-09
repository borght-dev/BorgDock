# Release PRDock

Create a new release: generate changelog, build locally to verify, bump version, tag, and push. The GitHub Actions workflow handles packaging, uploading, and publishing.

## Arguments

- `$ARGUMENTS` — The version to release (e.g. `1.0.0`). Required.

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

3. **Update the version** in `src/PRDock.App/PRDock.App.csproj` to the provided version.

4. **Build and publish** the app (local verification only):
   ```
   dotnet publish src/PRDock.App -c Release -r win-x64 --self-contained -o publish
   ```

5. **Install vpk** if not already available:
   ```
   dotnet tool install -g vpk
   ```
   (ignore errors if already installed)

6. **Pack with Velopack** to verify Setup.exe generation:
   ```
   vpk pack --packId PRDock --packVersion <VERSION> --packDir publish --mainExe PRDock.App.exe --icon src/PRDock.App/Assets/tray-icon.ico
   ```

7. **Verify** that `Releases/PRDock-Setup.exe` was created. List the `Releases/` directory and confirm. Abort if not found.

8. **Commit** the version bump and changelog:
   ```
   git add src/PRDock.App/PRDock.App.csproj CHANGELOG.md
   git commit -m "chore: release <VERSION>"
   ```

9. **Tag and push**:
   ```
   git tag v<VERSION>
   git push && git push origin v<VERSION>
   ```

10. **Print status**: Tell the user the tag has been pushed and the GitHub Actions workflow will automatically build, upload assets, and publish the release. Provide the URL: `https://github.com/<repo>/actions` so they can monitor progress.

11. **Clean up** the `publish/` and `Releases/` directories.

## Important

- This command must be run on a Windows machine (Setup.exe generation requires Windows).
- If any step fails, stop and report the error — do not continue with partial state.
- The GitHub Actions workflow handles everything after the tag push: building, packing (with delta generation), uploading to GitHub Releases, and publishing the release (not draft). It uses the CHANGELOG.md content for release notes.
