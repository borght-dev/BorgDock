# Hero images for "What's new?" window

Drop one PNG, JPG, GIF, or WEBP per highlight into `docs/whats-new/<version>/`,
then reference it from the corresponding bullet in `/CHANGELOG.md`:

    - **Close PRs from the detail panel** — One-line description. ![](whats-new/1.0.11/close-pr.png)

The build-time Vite plugin lifts the image out of the bullet, copies it to
`src/PRDock.Tauri/public/whats-new/<version>/`, and serves it at
`/whats-new/<version>/<name>.png`.

Constraints:
- Current-release highlights require an image (enforced by `npm run validate-release`).
- Historical releases render a gradient fallback when an image is missing.
- First `![](...)` in a bullet is the hero; additional images stay inline in the description.
