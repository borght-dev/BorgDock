# Release PRDock

Create a new release with Setup.exe and push a tag to trigger the GitHub Actions workflow.

## Arguments

- `$ARGUMENTS` — The version to release (e.g. `1.0.0`). Required.

## Steps

1. **Validate** the version argument is provided and looks like a semver (x.y.z). Abort if not.

2. **Update the version** in `src/PRDock.App/PRDock.App.csproj` to the provided version.

3. **Build and publish** the app:
   ```
   dotnet publish src/PRDock.App -c Release -r win-x64 --self-contained -o publish
   ```

4. **Install vpk** if not already available:
   ```
   dotnet tool install -g vpk
   ```
   (ignore errors if already installed)

5. **Pack with Velopack** to generate Setup.exe:
   ```
   vpk pack --packId PRDock --packVersion <VERSION> --packDir publish --mainExe PRDock.App.exe --icon src/PRDock.App/Assets/tray-icon.ico
   ```

6. **Verify** that `Releases/PRDock-Setup.exe` (or similar) was created. List the `Releases/` directory and confirm the Setup.exe exists. Abort if not found.

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

9. **Wait for the GitHub Release** to be created by the Actions workflow. Poll with `gh release view v<VERSION>` every 30 seconds, up to 10 minutes. Show progress while waiting.

10. **Upload Setup.exe** to the GitHub Release:
    ```
    gh release upload v<VERSION> Releases/PRDock-Setup.exe --clobber
    ```

11. **Print the release URL** so the user can verify:
    ```
    gh release view v<VERSION> --web
    ```

12. **Clean up** the `publish/` and `Releases/` directories.

## Important

- This command must be run on a Windows machine (Setup.exe generation requires Windows).
- If any step fails, stop and report the error — do not continue with partial state.
- The GitHub Actions workflow will separately upload the update nupkgs (full + delta) to the same release.
