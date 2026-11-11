# Pull requests overview proof

The approved mockups (`design/pr-overview/`) next to this branch's Storybook, with the same
made-up data: 23 open `acme/*` PRs and three shared CI failures
(`src/BorgDock.Tauri/src/components/pr/__fixtures__/pr-overview-data.ts`). The mockups were rendered
from their artboard files with `design/pr-overview/support.js`; the app images come from the
`PR/PrList` stories.

| Mockup | Comparison | Story |
|---|---|---|
| A · Table view | [a-table.png](a-table.png) | `pr-prlist--overview-light` |
| B · Display menu | [b-display-menu.png](b-display-menu.png) | `pr-prlist--display-menu` |
| C · Filters and saved views | [c-filters.png](c-filters.png) | `pr-prlist--filter-menu` |
| D · Board | [d-board.png](d-board.png) | `pr-prlist--board-light` |
| E · Docked sidebar | [e-docked.png](e-docked.png) | `pr-prlist--docked` |

More states: [dark table](table-dark.png), [saved view with unsaved changes](saved-view-edited.png),
[shared CI failures opened](ci-summary-open.png), [author then status sub-groups](sub-groups.png).

## Where the app differs from the mockups

- Rows are 42 px (32 px compact), not the mockup's ~55 px: the list is virtualized at a fixed
  height, so everything sits on the title or meta line.
- Avatars use the app's own avatar tones, not a colour per person.
- The search box shows the query as text; qualifiers appear as chips under it rather than as
  coloured tokens inside it.
- Shared failures that are not the PR's doing read "not this PR"; the mockup used "shared ×4"
  for some of them.
- Not built: Workstream grouping and the Workstream, T3 thread, Risk, Labels and Work item columns
  (labels and `AB#` chips stay on the title line).

## Validation

Run in this checkout (macOS):

- `tsc -b`, `bun run build`, `bun run lint` (no errors; the warnings are on `main` already)
- Vitest: 4,824 passed, 3 skipped, including 400+ new tests for `services/pr-list/` and the
  rewritten `PrList` component tests
- Playwright: `pr-list`, `pr-list-views` (new), `pr-search`, `quick-review-actions`, `focus`,
  `hover-cards`, `dependency-approve`, `hotkeys`, `smoke`, `t3-pr-thread`, `workstreams`,
  `shell-navigation`, `perf`, `work-items`, `activity`. Under four workers on a loaded machine some
  detail-view and Quick Review tests timed out; each passed when rerun with one worker.

Storybook and mocked Tauri only; the native app was not run.
