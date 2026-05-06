// src/components/file-viewer/__fixtures__/file-viewer-data.ts
//
// Shared fixtures for FileViewerApp.stories.tsx. AppSettings is built up
// via makeSettings(). Patches are unified-diff strings as they come back
// from the `git_file_diff` Tauri command.

import type { AppSettings } from '@/types/settings';

const BASE_UI = {
  theme: 'system' as const,
  showFlyoutBadge: true,
  fileViewerDefaultViewMode: 'unified' as const,
};

export function makeSettings(uiOverrides?: Partial<AppSettings['ui']>): AppSettings {
  return {
    setupComplete: true,
    gitHub: {
      authMethod: 'ghCli',
      pollIntervalSeconds: 30,
      username: 'storybook',
    },
    repos: [],
    ui: { ...BASE_UI, ...(uiOverrides ?? {}) } as AppSettings['ui'],
    notifications: {
      toastOnCheckStatusChange: false,
      toastOnNewPR: false,
      toastOnReviewUpdate: false,
      toastOnMergeable: false,
      onlyMyPRs: true,
      playMergeSound: false,
      reviewNudgeEnabled: false,
      reviewNudgeIntervalMinutes: 30,
      reviewNudgeEscalation: false,
      deduplicationWindowSeconds: 60,
      channels: { tray: true, system: false, sound: false, emailDigest: false },
    },
    claudeCode: { defaultPostFixAction: 'none' },
    claudeApi: {
      model: 'claude-sonnet-4-6',
      maxTokens: 8192,
      prSummaryEnabled: false,
      diffExplanationsEnabled: false,
      reviewNudgePhrasingEnabled: false,
      commitMessageSuggestionsEnabled: false,
    },
    claudeReview: { botUsername: 'claude[bot]' },
    updates: { autoCheckEnabled: false, autoDownload: false },
    azureDevOps: {
      organization: '',
      project: '',
      authMethod: 'azCli',
      authAutoDetected: false,
      pollIntervalSeconds: 30,
      favoriteQueryIds: [],
      trackedWorkItemIds: [],
      workingOnWorkItemIds: [],
      workItemWorktreePaths: {},
      recentWorkItemIds: [],
      linkMatchBy: 'branch',
      showWorkItemStateOnPrCard: false,
      updatePrStatusWhenWiDone: false,
    },
    sql: {
      connections: [],
      readOnlyByDefault: false,
      confirmDestructiveWithoutWhere: true,
    },
    repoPriority: {},
  };
}

// ---------------------------------------------------------------------------
// File-content samples
// ---------------------------------------------------------------------------

// Small TSX with keywords / strings / JSX tags / numbers — exercises the
// hl-keyword / hl-string / hl-tag / hl-number categories the highlighter
// emits. Used by the syntax-highlight probe story.
export const TSX_SAMPLE = `import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div className="counter">
      <span>Count: {count}</span>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}
`;

export const PLAIN_TEXT_SAMPLE = `BorgDock README

A desktop app that monitors GitHub PRs as a docked sidebar.

Quick start:
  npm install
  npm run dev
`;

export const LARGE_TS_SAMPLE = Array.from({ length: 80 }, (_, i) =>
  `export const item${i} = { id: ${i}, label: 'item-${i}' };`,
).join('\n') + '\n';

// ---------------------------------------------------------------------------
// Patch samples (unified diff format from git_file_diff)
// ---------------------------------------------------------------------------

export const PATCH_SINGLE_HUNK_TS = `diff --git a/src/components/Counter.tsx b/src/components/Counter.tsx
index 1111..2222 100644
--- a/src/components/Counter.tsx
+++ b/src/components/Counter.tsx
@@ -1,9 +1,11 @@
 import { useState } from 'react';

 export function Counter() {
-  const [count, setCount] = useState(0);
+  const [count, setCount] = useState<number>(0);
+  const reset = () => setCount(0);
   return (
     <div className="counter">
       <span>Count: {count}</span>
+      <button onClick={reset}>Reset</button>
       <button onClick={() => setCount(count + 1)}>Increment</button>
     </div>
   );
`;

export const PATCH_ADD_ONLY_TS = `diff --git a/src/lib/new-helper.ts b/src/lib/new-helper.ts
new file mode 100644
index 0000..3333
--- /dev/null
+++ b/src/lib/new-helper.ts
@@ -0,0 +1,5 @@
+export function helper(x: number): number {
+  return x * 2;
+}
+
+export const MAGIC = 42;
`;

export const PATCH_DELETE_ONLY_TS = `diff --git a/src/lib/old-helper.ts b/src/lib/old-helper.ts
deleted file mode 100644
index 4444..0000
--- a/src/lib/old-helper.ts
+++ /dev/null
@@ -1,4 +0,0 @@
-export function legacy() {
-  return 'unused';
-}
-export const STALE = true;
`;

export const PATCH_MULTI_HUNK_TS = `diff --git a/src/services/api.ts b/src/services/api.ts
index 5555..6666 100644
--- a/src/services/api.ts
+++ b/src/services/api.ts
@@ -1,8 +1,9 @@
 import { request } from './request';

 export async function fetchUser(id: string) {
-  const r = await request(\`/users/\${id}\`);
-  return r.json();
+  const r = await request(\`/users/\${encodeURIComponent(id)}\`);
+  if (!r.ok) throw new Error('user fetch failed');
+  return r.json() as Promise<User>;
 }

 export async function fetchUsers() {
@@ -20,5 +21,9 @@ export async function fetchUsers() {
   return r.json();
 }

+export async function deleteUser(id: string) {
+  await request(\`/users/\${encodeURIComponent(id)}\`, { method: 'DELETE' });
+}
+
 export type User = { id: string; name: string };
`;

// ---------------------------------------------------------------------------
// Canned `git_file_diff` response shapes
// ---------------------------------------------------------------------------

export const DIFF_NOT_IN_REPO = { patch: '', baselineRef: '', inRepo: false } as const;

export const DIFF_IN_REPO_NO_CHANGES = {
  patch: '',
  baselineRef: 'HEAD',
  inRepo: true,
} as const;

// ---------------------------------------------------------------------------
// File-load error shapes (read_text_file rejection payloads)
// ---------------------------------------------------------------------------

export const ERR_NOT_FOUND = { kind: 'notFound' };
export const ERR_BINARY = { kind: 'binary' };
export const ERR_TOO_LARGE = { kind: 'tooLarge' };
