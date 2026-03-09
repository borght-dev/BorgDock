# Release PRDock

Create a new release: build locally to verify, bump version, tag, and push. The GitHub Actions workflow handles packaging, uploading, changelog generation, and publishing.

## Arguments

- `$ARGUMENTS` — The version to release (e.g. `1.0.0`). Required.

## Steps

1. **Validate** the version argument is provided and looks like a semver (x.y.z). Abort if not.

2. **Update the version** in `src/PRDock.App/PRDock.App.csproj` to the provided version.

3. **Build and publish** the app (local verification only):
   ```
   dotnet publish src/PRDock.App -c Release -r win-x64 --self-contained -o publish
   ```

4. **Install vpk** if not already available:
   ```
   dotnet tool install -g vpk
   ```
   (ignore errors if already installed)

5. **Pack with Velopack** to verify Setup.exe generation:
   ```
   vpk pack --packId PRDock --packVersion <VERSION> --packDir publish --mainExe PRDock.App.exe --icon src/PRDock.App/Assets/tray-icon.ico
   ```

6. **Verify** that `Releases/PRDock-Setup.exe` was created. List the `Releases/` directory and confirm. Abort if not found.

7. **Commit** the version bump:
   ```
   git add src/PRDock.App/PRDock.App.csproj
   git commit -m "chore: bump version to <VERSION>"
   ```

8. **Tag and push**:
   ```
   git tag v<VERSION>
   git push && git push origin v<VERSION>
   ```

9. **Print status**: Tell the user the tag has been pushed and the GitHub Actions workflow will automatically build, upload assets, generate a changelog, and publish the release. Provide the URL: `https://github.com/<repo>/actions` so they can monitor progress.

10. **Clean up** the `publish/` and `Releases/` directories.

## Important

- This command must be run on a Windows machine (Setup.exe generation requires Windows).
- If any step fails, stop and report the error — do not continue with partial state.
- The GitHub Actions workflow handles everything after the tag push: building, packing (with delta generation), uploading to GitHub Releases, generating the changelog from commits, and publishing the release (not draft).
