import type { PullRequestFileChange } from '@/types';

/**
 * The iteration 2 mockup's large pull request (#482, 23 files across the
 * services, components, hooks, Tauri side, settings, docs and root), with
 * `bun.lock` and `src/generated/changelog.ts` as the generated files. Used by
 * the Quick Review stories and tests. Plain data and type-only imports, so a
 * Playwright spec can import it too.
 */
const FILES: [folder: string, name: string, additions: number, deletions: number][] = [
  ['src/services', 't3-thread.ts', 120, 8],
  ['src/services', 't3-session-store.ts', 86, 0],
  ['src/components/pr', 'T3SessionStrip.tsx', 140, 0],
  ['src/components/pr', 'T3SessionStrip.stories.tsx', 64, 0],
  ['src/components/pr', 'PrRow.tsx', 18, 4],
  ['src/components/pr', 'PrCardContainer.tsx', 9, 2],
  ['src/hooks', 'useT3Session.ts', 52, 0],
  ['src/hooks/__tests__', 'useT3Session.test.ts', 96, 0],
  ['src/stores', 't3.ts', 40, 6],
  ['src/types', 't3.ts', 22, 0],
  ['src-tauri/src', 't3.rs', 210, 30],
  ['src-tauri/src', 'lib.rs', 6, 1],
  ['src-tauri/capabilities', 'main.json', 3, 0],
  ['src/components/settings', 'AgentsPanel.tsx', 74, 20],
  ['src/components/settings', 'T3PairingCard.tsx', 58, 0],
  ['src/styles', 'index.css', 31, 4],
  ['e2e', 't3-session.spec.ts', 88, 0],
  ['docs/docs/internal/features', 't3.md', 60, 10],
  ['', 'CHANGELOG.md', 4, 0],
  ['src/generated', 'changelog.ts', 210, 110],
  ['', 'package.json', 1, 1],
  ['', 'bun.lock', 360, 24],
  ['src/components/layout', 'MainWindow.stories.tsx', 12, 0],
];

function patchFor(name: string, additions: number, deletions: number): string {
  const shown = Math.min(additions, 12);
  const removed = Math.min(deletions, 4);
  const lines = [
    `@@ -1,${removed + 1} +1,${shown + 1} @@`,
    ` // ${name}`,
    ...Array.from({ length: removed }, (_, i) => `-const previous${i} = ${i};`),
    ...Array.from({ length: shown }, (_, i) => `+const line${i} = '${name}:${i}';`),
  ];
  return lines.join('\n');
}

export const LARGE_PR_FILES: PullRequestFileChange[] = FILES.map(
  ([folder, name, additions, deletions], i) => ({
    filename: folder ? `${folder}/${name}` : name,
    sha: `blob-${i}`,
    status: deletions === 0 && additions > 20 ? 'added' : 'modified',
    additions,
    deletions,
    patch: patchFor(name, additions, deletions),
  }),
);

export const LARGE_PR_TITLE = 'T3 Code: live agent sessions on pull requests';

export const LARGE_PR_BODY = `## Summary
Shows a live strip under a pull request while a T3 Code thread is working on it: the thread title, its state and the last assistant message, refreshed every 10 s from the projection database.

## What changed
- \`src/services/t3-thread.ts\` now exposes \`watchThreadForPr(prId)\` which polls \`projection_threads\` by \`linkedPullRequest\`.
- New \`T3SessionStrip\` component under the PR row; collapses when the thread is idle for more than 30 min.
- \`src-tauri/src/t3.rs\` gained a read-only \`t3_read_threads\` command that runs on \`spawn_blocking\` (no I/O on the main thread).
- Settings: the Agents panel shows pairing state and lets you unpair.
- Capability grants for the main window updated for the new command.

## How to test
1. Pair T3 in Settings, then open a thread on any PR with "Open a new thread in T3".
2. Type anything in the thread; within 10 s the strip under the PR row shows the message.
3. Unpair; the strip disappears and no polling happens (check the log for \`t3_read_threads\`).

## Notes
The strip is intentionally read-only. Replying from BorgDock is a separate PR because it needs the dispatch API and a permission prompt.`;
