# Design bundle (frozen copy)

Verbatim copy of the Claude Design handoff bundle dated 2026-04-23
(see `docs/superpowers/specs/2026-04-24-shared-components-design.md`
for origin and intent).

**Do not edit.** Treat this tree as read-only. When the design is
updated upstream, replace the whole `borgdock/` subtree in one commit
so the baseline regeneration shows a coherent diff.

- `borgdock/project/BorgDock - Streamlined.html` — the primary
  artboard canvas; every visual baseline is captured from this file
  by `tests/e2e/scripts/capture-design-baselines.ts`.
- `borgdock/project/components/data.jsx` — mock fixtures; ported
  into `tests/e2e/fixtures/design-fixtures.ts` (see Task 4).
- `borgdock/project/uploads/DESIGN-SYSTEM.md` — canonical token
  catalog; consumed by Task 1 of PR #1 when `@theme` is wired up.

## Regeneration

The bundle originates from Claude Design (`claude.ai/design`) and is
delivered as a gzipped tar at a session-specific API URL. The upstream
URL for the current copy was:

`https://api.anthropic.com/v1/design/h/KgzGCfFQguSBv-1nSS0jXw`
(fetched 2026-04-23).

The fetched bytes were saved as `design.gz`, then:

```sh
gunzip design.gz       # produces a POSIX tar archive
tar -xf design         # extracts the `borgdock/` tree
```

To replace the vendored copy with a new upstream bundle:

1. Remove the current subtree: `rm -rf src/BorgDock.Tauri/tests/e2e/design-bundle/borgdock`
2. Extract the new bundle there in one move so the git diff tracks the
   change atomically: `cp -R /path/to/new/borgdock src/BorgDock.Tauri/tests/e2e/design-bundle/borgdock`
3. Re-run the capture script to regenerate all baselines:
   `npm run test:e2e:capture-design`
4. Note the change in the `## CHANGES` section below (new upstream
   fetch date, any known artboard delta).

## CHANGES

Record any non-verbatim edits to the vendored tree here. The tree is
otherwise read-only; every entry in this section is an exception.

*(none yet)*
