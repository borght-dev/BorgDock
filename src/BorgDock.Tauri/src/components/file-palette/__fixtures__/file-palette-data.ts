// src/components/file-palette/__fixtures__/file-palette-data.ts
//
// Synthetic AppSettings / repo / worktree / index / content-search /
// changed-files / diff fixtures for the FilePaletteApp Storybook
// catalog. Real data never enters Storybook — these fixtures are the
// only inputs.

import type { AppSettings, RepoSettings } from '@/types/settings';
import type { ChangedFileEntry } from '../FilePaletteChangesSection';
import type { ContentFileResult } from '../use-content-search';
import type { FileEntry } from '../use-file-index';

// Mirrors the local interface inside FilePaletteApp.tsx (non-exported).
export interface WorktreeEntry {
  path: string;
  branchName: string;
  isMainWorktree: boolean;
}

export interface ChangedFilesOutput {
  local: ChangedFileEntry[];
  vsBase: ChangedFileEntry[];
  baseRef: string;
  inRepo: boolean;
}

// ---------------------------------------------------------------------------
// AppSettings factory
// ---------------------------------------------------------------------------

export function canonicalSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    setupComplete: true,
    gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 60, username: 'storybook' },
    repos: [],
    ui: {
      theme: 'system',
      globalHotkey: '',
      flyoutHotkey: '',
      editorCommand: 'code',
      runAtStartup: false,
      quickReviewHotkey: '',
      startMinimizedToTray: false,
      restoreLastSelection: true,
    },
    notifications: {
      toastOnCheckStatusChange: false,
      toastOnNewPR: false,
      toastOnReviewUpdate: false,
      toastOnMergeable: false,
      onlyMyPRs: false,
      playMergeSound: false,
      reviewNudgeEnabled: false,
      reviewNudgeIntervalMinutes: 60,
      reviewNudgeEscalation: false,
      deduplicationWindowSeconds: 60,
      channels: { tray: false, system: false, sound: false, emailDigest: false },
    },
    claudeReview: { botUsername: '' },
    updates: { autoCheckEnabled: false, autoDownload: false },
    azureDevOps: {
      organization: '',
      project: '',
      authMethod: 'pat',
      authAutoDetected: false,
      pollIntervalSeconds: 60,
      favoriteQueryIds: [],
      trackedWorkItemIds: [],
      workingOnWorkItemIds: [],
      workItemWorktreePaths: {},
      recentWorkItemIds: [],
      linkMatchBy: 'both',
      showWorkItemStateOnPrCard: false,
      updatePrStatusWhenWiDone: false,
    },
    sql: { connections: [], readOnlyByDefault: true, confirmDestructiveWithoutWhere: true },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Repo / worktree factories
// ---------------------------------------------------------------------------

export function makeRepo(overrides: Partial<RepoSettings> = {}): RepoSettings {
  return {
    owner: 'borght-dev',
    name: 'BorgDock',
    enabled: true,
    worktreeBasePath: '/Users/storybook/worktrees/BorgDock',
    worktreeSubfolder: 'wt',
    favoriteWorktreePaths: [],
    ...overrides,
  };
}

export function makeWorktree(overrides: Partial<WorktreeEntry> = {}): WorktreeEntry {
  return {
    path: '/Users/storybook/worktrees/BorgDock/main',
    branchName: 'main',
    isMainWorktree: true,
    ...overrides,
  };
}

export const repoBorgDock: RepoSettings = makeRepo();

export const repoFspHorizon: RepoSettings = makeRepo({
  owner: 'gomocha',
  name: 'fsp-horizon',
  worktreeBasePath: '/Users/storybook/worktrees/fsp-horizon',
});

export const repoCustomFavs: RepoSettings = makeRepo({
  owner: 'borght-dev',
  name: 'BorgDock',
  favoriteWorktreePaths: [
    '/Users/storybook/worktrees/BorgDock/feature-a',
    '/Users/storybook/worktrees/BorgDock/main',
  ],
});

export const wtMainBorgDock: WorktreeEntry = makeWorktree();
export const wtFeatureBorgDock: WorktreeEntry = makeWorktree({
  path: '/Users/storybook/worktrees/BorgDock/feature-a',
  branchName: 'feature/a',
  isMainWorktree: false,
});
export const wtMainFsp: WorktreeEntry = makeWorktree({
  path: '/Users/storybook/worktrees/fsp-horizon/main',
  branchName: 'main',
  isMainWorktree: true,
});

// ---------------------------------------------------------------------------
// File-index fixtures (sized to keep tree-sitter indexer fast)
// ---------------------------------------------------------------------------

export function makeFileEntry(rel: string, size = 1024): FileEntry {
  return { rel_path: rel, size };
}

export const tinyFileIndex: FileEntry[] = [
  makeFileEntry('src/App.tsx', 1200),
  makeFileEntry('src/index.tsx', 600),
  makeFileEntry('src/components/Button.tsx', 800),
  makeFileEntry('src/components/Card.tsx', 700),
  makeFileEntry('src/utils/format.tsx', 500),
];

export const mediumFileIndex: FileEntry[] = (() => {
  const out: FileEntry[] = [];
  for (let i = 0; i < 50; i++) {
    const ext = ['tsx', 'ts', 'json', 'css', 'md'][i % 5]!;
    out.push(makeFileEntry(`src/file-${String(i).padStart(2, '0')}.${ext}`, 100 + i * 32));
  }
  return out;
})();

export const largeFileIndexCapped: FileEntry[] = (() => {
  const out: FileEntry[] = [];
  for (let i = 0; i < 600; i++) {
    out.push(makeFileEntry(`src/big/dir-${i % 30}/file-${i}.ts`, 200 + i));
  }
  return out;
})();

// ---------------------------------------------------------------------------
// Content-search fixtures
// ---------------------------------------------------------------------------

export function makeContentResult(rel: string, hitLines: number[]): ContentFileResult {
  return {
    rel_path: rel,
    match_count: hitLines.length,
    matches: hitLines.map((line) => ({ line, preview: `…match on line ${line}…` })),
  };
}

export const contentResultsForFoo: ContentFileResult[] = [
  makeContentResult('src/App.tsx', [12, 47, 89]),
  makeContentResult('src/components/Card.tsx', [4, 22]),
  makeContentResult('src/utils/format.tsx', [7, 14, 31, 44]),
  makeContentResult('src/index.tsx', [3, 9, 18]),
];

// ---------------------------------------------------------------------------
// Changed-files fixtures
// ---------------------------------------------------------------------------

export function makeChangedFile(
  path: string,
  status = 'M',
  additions = 4,
  deletions = 2,
): ChangedFileEntry {
  return { path, status, additions, deletions };
}

export const changedFilesEmpty: ChangedFilesOutput = {
  local: [],
  vsBase: [],
  baseRef: 'main',
  inRepo: true,
};

export const changedFilesNotInRepo: ChangedFilesOutput = {
  local: [],
  vsBase: [],
  baseRef: '',
  inRepo: false,
};

export const changedFilesLocalOnly: ChangedFilesOutput = {
  local: [
    makeChangedFile('src/App.tsx', 'M', 8, 3),
    makeChangedFile('src/components/Button.tsx', 'M', 2, 0),
    makeChangedFile('src/components/Card.tsx', 'A', 40, 0),
    makeChangedFile('src/legacy/old.ts', 'D', 0, 25),
  ],
  vsBase: [],
  baseRef: 'main',
  inRepo: true,
};

export const changedFilesBoth: ChangedFilesOutput = {
  local: [
    makeChangedFile('src/App.tsx', 'M', 8, 3),
    makeChangedFile('src/components/Button.tsx', 'M', 2, 0),
    makeChangedFile('src/components/Card.tsx', 'A', 40, 0),
    makeChangedFile('src/legacy/old.ts', 'D', 0, 25),
  ],
  vsBase: [
    makeChangedFile('src/App.tsx', 'M', 12, 5),
    makeChangedFile('src/utils/format.tsx', 'A', 30, 0),
    makeChangedFile('src/index.tsx', 'M', 1, 1),
  ],
  baseRef: 'main',
  inRepo: true,
};

// ---------------------------------------------------------------------------
// Preview fixtures (read_text_file payloads + errors)
// ---------------------------------------------------------------------------

export const tsxFileSample = `import { useState } from 'react';

interface CounterProps {
  initial: number;
}

export function Counter({ initial }: CounterProps) {
  const [count, setCount] = useState(initial);
  const increment = () => setCount((n) => n + 1);
  return (
    <div className="counter">
      <span className="counter-value">{count}</span>
      <button type="button" onClick={increment}>
        +1
      </button>
    </div>
  );
}
`;

export const tooLargeError = { kind: 'tooLarge' as const, size: 4_000_000, limit: 1_500_000 };
export const binaryError = { kind: 'binary' as const };
export const notFoundError = { kind: 'notFound' as const };

// ---------------------------------------------------------------------------
// Diff fixture (git_file_diff payload)
// ---------------------------------------------------------------------------

export const sampleDiffPatch = `diff --git a/src/App.tsx b/src/App.tsx
index 1111111..2222222 100644
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1,5 +1,7 @@
 import { useState } from 'react';
+import { Counter } from './components/Counter';

 export function App() {
-  return <h1>Hello</h1>;
+  return <Counter initial={0} />;
 }
@@ -10,3 +12,4 @@ export function App() {
 // legacy code below
 const _legacy = true;
+const _added = 'storybook fixture';
`;

export const sampleDiffOutput = {
  patch: sampleDiffPatch,
  baselineRef: 'main',
  inRepo: true,
};
