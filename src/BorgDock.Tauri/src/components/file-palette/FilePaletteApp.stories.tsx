// src/components/file-palette/FilePaletteApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { userEvent, within } from 'storybook/test';
import { getControl } from '../../../.storybook/mocks/control';
import {
  binaryError,
  canonicalSettings,
  changedFilesBoth,
  changedFilesEmpty,
  changedFilesLocalOnly,
  changedFilesNotInRepo,
  contentResultsForFoo,
  largeFileIndexCapped,
  makeChangedFile,
  makeFileEntry,
  mediumFileIndex,
  repoBorgDock,
  repoCustomFavs,
  repoFspHorizon,
  sampleDiffOutput,
  tinyFileIndex,
  tsxFileSample,
  wtFeatureBorgDock,
  wtMainBorgDock,
  wtMainFsp,
} from './__fixtures__/file-palette-data';
import { FilePaletteApp } from './FilePaletteApp';

interface FilePaletteStoryParams {
  /** Static or function-form invokeResponses to seed before mount. */
  invokeResponses?: Record<string, unknown | ((args: unknown) => unknown)>;
  /** Plugin-dialog response for the Add-custom-root flow. */
  pluginDialogOpenResponse?: string | string[] | null;
}

function applyParamsBeforeMount(params: FilePaletteStoryParams) {
  const ctrl = getControl();

  // Always seed window_ready as a no-op so the reveal effect doesn't error.
  ctrl.invokeResponses['window_ready'] = undefined;

  for (const [k, v] of Object.entries(params.invokeResponses ?? {})) {
    ctrl.invokeResponses[k] = v;
  }
  if (params.pluginDialogOpenResponse !== undefined) {
    ctrl.pluginDialog.openResponse = params.pluginDialogOpenResponse;
  }
}

function FilePaletteHarness({ params }: { params: FilePaletteStoryParams }) {
  // Apply BEFORE the inner component mounts. Effects run after children
  // mount in React, so we call this synchronously in the function body.
  applyParamsBeforeMount(params);

  useEffect(() => {
    // Lifetime-scoped — preview decorator already calls reset() before each render.
  }, []);

  return (
    <div style={{ width: 960, height: 600 }}>
      <FilePaletteApp />
    </div>
  );
}

const meta: Meta<typeof FilePaletteHarness> = {
  title: 'File Palette/FilePaletteApp',
  component: FilePaletteHarness,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof FilePaletteHarness>;

function story(params: FilePaletteStoryParams = {}): Story {
  return { args: { params } };
}

// ---------------------------------------------------------------------------
// Helpers — one place to compose the boilerplate invokeResponses each story
// needs. `loadedPalette` is the "happy default" map; stories override individual
// keys for axis-specific variation.
// ---------------------------------------------------------------------------

function loadedPalette(
  overrides: Record<string, unknown | ((args: unknown) => unknown)> = {},
): Record<string, unknown | ((args: unknown) => unknown)> {
  const settings = canonicalSettings({
    repos: [{ ...repoBorgDock }],
  });
  return {
    load_settings: settings,
    list_worktrees_bare: [wtMainBorgDock],
    list_root_files: { entries: mediumFileIndex, truncated: false },
    git_changed_files: changedFilesEmpty,
    read_text_file: tsxFileSample,
    save_settings: undefined,
    open_file_viewer_window: undefined,
    open_in_editor: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Bootstrap / load axis
// ---------------------------------------------------------------------------

export const Loading: Story = story({
  invokeResponses: {
    load_settings: () => new Promise(() => {}),
  },
});

export const SettingsLoadFailed: Story = story({
  invokeResponses: {
    load_settings: () => {
      throw new Error('storybook: load_settings rejected');
    },
  },
});

// ---------------------------------------------------------------------------
// Roots-column axis
// ---------------------------------------------------------------------------

export const SingleWorktreeRoot: Story = story({
  invokeResponses: loadedPalette(),
});

export const MultipleRootsActive: Story = story({
  invokeResponses: loadedPalette({
    load_settings: canonicalSettings({
      repos: [{ ...repoBorgDock }, { ...repoFspHorizon }],
      filePaletteRoots: [{ path: '/Users/storybook/extra/notes' }],
    }),
    list_worktrees_bare: (args: unknown) => {
      const a = args as { basePath?: string };
      if (a.basePath?.endsWith('BorgDock')) {
        return [wtMainBorgDock, wtFeatureBorgDock];
      }
      if (a.basePath?.endsWith('fsp-horizon')) {
        return [wtMainFsp];
      }
      return [];
    },
  }),
});

export const FavoritesOnly: Story = story({
  invokeResponses: loadedPalette({
    load_settings: canonicalSettings({
      repos: [{ ...repoCustomFavs }],
      ui: {
        ...canonicalSettings().ui,
        filePaletteFavoritesOnly: true,
      },
    }),
    list_worktrees_bare: [wtMainBorgDock, wtFeatureBorgDock],
  }),
});

// ---------------------------------------------------------------------------
// Search-modes axis
// ---------------------------------------------------------------------------

export const DefaultMixed: Story = story({
  invokeResponses: loadedPalette(),
});

export const FilenameSearchActive: Story = {
  args: { params: { invokeResponses: loadedPalette() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, 'file-1');
  },
};

export const ContentSearchActive: Story = {
  args: {
    params: {
      invokeResponses: loadedPalette({
        search_content: contentResultsForFoo,
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, '>foo');
  },
};

export const SymbolSearchActive: Story = {
  args: {
    params: {
      invokeResponses: loadedPalette({
        list_root_files: { entries: tinyFileIndex, truncated: false },
        // The symbol indexer reads each file's content to extract symbols.
        // Return a minimal payload — the indexer is a tree-sitter probe; if
        // wasm fails to load, the story still renders (just with zero hits).
        read_text_file: 'export function App() { return null }',
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, '@App');
  },
};

// ---------------------------------------------------------------------------
// Results-state axis
// ---------------------------------------------------------------------------

export const ResultsEmptyNoMatch: Story = {
  args: { params: { invokeResponses: loadedPalette() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, 'zzznosuchstring');
  },
};

export const ResultsTruncated: Story = story({
  invokeResponses: loadedPalette({
    list_root_files: { entries: largeFileIndexCapped, truncated: true },
  }),
});

// ---------------------------------------------------------------------------
// Changes-section axis
// ---------------------------------------------------------------------------

export const ChangesLocalOnly: Story = story({
  invokeResponses: loadedPalette({
    git_changed_files: changedFilesLocalOnly,
  }),
});

export const ChangesBothGroups: Story = story({
  invokeResponses: loadedPalette({
    git_changed_files: changedFilesBoth,
  }),
});

export const ChangesNotInRepo: Story = story({
  invokeResponses: loadedPalette({
    git_changed_files: changedFilesNotInRepo,
  }),
});

export const ChangesCollapsed: Story = story({
  invokeResponses: loadedPalette({
    load_settings: canonicalSettings({
      repos: [{ ...repoBorgDock }],
      ui: {
        ...canonicalSettings().ui,
        filePaletteChangesCollapsed: true,
      },
    }),
    git_changed_files: changedFilesBoth,
  }),
});

// ---------------------------------------------------------------------------
// Preview-pane axis
// ---------------------------------------------------------------------------

export const PreviewEmpty: Story = story({
  invokeResponses: loadedPalette(),
});

export const PreviewFileLoading: Story = {
  args: {
    params: {
      invokeResponses: loadedPalette({
        read_text_file: () => new Promise(() => {}),
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, 'file-0');
    const rows = await canvas.findAllByRole('button');
    const fileRow = rows.find((r) => r.textContent?.includes('file-00'));
    if (fileRow) await userEvent.click(fileRow);
  },
};

export const PreviewFileOk: Story = {
  args: {
    params: {
      invokeResponses: loadedPalette({
        read_text_file: tsxFileSample,
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, 'file-00');
    const rows = await canvas.findAllByRole('button');
    const fileRow = rows.find((r) => r.textContent?.includes('file-00'));
    if (fileRow) await userEvent.click(fileRow);
    // Wait for the preview body to render the file content.
    await canvas.findAllByTestId('code-line-row');
  },
};

export const PreviewFileBinary: Story = {
  args: {
    params: {
      invokeResponses: loadedPalette({
        read_text_file: () => {
          throw binaryError;
        },
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, 'file-00');
    const rows = await canvas.findAllByRole('button');
    const fileRow = rows.find((r) => r.textContent?.includes('file-00'));
    if (fileRow) await userEvent.click(fileRow);
    await canvas.findByText(/binary file/i);
  },
};

export const PreviewDiffOk: Story = {
  args: {
    params: {
      invokeResponses: loadedPalette({
        git_changed_files: changedFilesBoth,
        git_file_diff: sampleDiffOutput,
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rows = await canvas.findAllByRole('button');
    const diffRow = rows.find((r) => r.textContent?.includes('App.tsx'));
    if (diffRow) await userEvent.click(diffRow);
    // The diff body renders with a hunk that includes our fixture marker.
    await canvas.findByText(/storybook fixture/);
  },
};

// ---------------------------------------------------------------------------
// Interaction axis
// ---------------------------------------------------------------------------

export const AddCustomRoot: Story = {
  args: {
    params: {
      invokeResponses: loadedPalette(),
      pluginDialogOpenResponse: '/Users/storybook/extra/notes',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const addBtn = await canvas.findByRole('button', { name: /add custom path/i });
    await userEvent.click(addBtn);
  },
};

export const PaletteReshown: Story = {
  args: { params: { invokeResponses: loadedPalette() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, 'foo');
    getControl().emit('palette-shown', null);
    await canvas.findByDisplayValue('');
  },
};

export const WindowFocusRefresh: Story = {
  args: {
    params: {
      invokeResponses: loadedPalette({
        git_changed_files: changedFilesLocalOnly,
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByPlaceholderText(/search/i);
    const before = getControl().invocations.filter((i) => i.command === 'git_changed_files').length;
    getControl().emit('__window.onFocusChanged', true);
    await new Promise((r) => setTimeout(r, 0));
    const after = getControl().invocations.filter((i) => i.command === 'git_changed_files').length;
    if (after <= before) {
      console.warn('[storybook] WindowFocusRefresh: no new git_changed_files invocation observed');
    }
  },
};

export const EscHidesWindow: Story = {
  args: { params: { invokeResponses: loadedPalette() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.click(input);
    await userEvent.keyboard('{Escape}');
  },
};

export const EnterOpensViewer: Story = {
  args: { params: { invokeResponses: loadedPalette() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, 'file-00');
    await userEvent.keyboard('{Enter}');
  },
};

// ---------------------------------------------------------------------------
// Site capture: a real-looking worktree, a query that hits the changes and
// several filenames, and a result selected with the keyboard (focus stays in
// the search box, so the row shows the selection bar, not a focus ring).
// Full viewport so the status bar is in the frame.
// ---------------------------------------------------------------------------

const MANY_RESULTS_INDEX = [
  'src/App.tsx',
  'src/components/pr/PrRowCore.tsx',
  'src/components/pr/PrRowCore.test.tsx',
  'src/components/pr/PrList.tsx',
  'src/components/worktree/WorktreeRows.tsx',
  'src/components/worktree/WorktreeList.tsx',
  'src/components/work-items/WorkItemRow.tsx',
  'src/components/focus/FocusList.tsx',
  'src/components/sql/ResultsGrid.tsx',
  'src/hooks/useRowSelection.ts',
  'src/styles/index.css',
  'src/styles/rows.css',
  'src/utils/motion.ts',
  'docs/row-grammar.md',
].map((rel, i) => makeFileEntry(rel, 600 + i * 90));

const MANY_RESULTS_CHANGES = {
  local: [
    makeChangedFile('src/components/pr/PrRowCore.tsx', 'M', 14, 6),
    makeChangedFile('src/styles/rows.css', 'A', 38, 0),
  ],
  vsBase: [makeChangedFile('src/components/worktree/WorktreeRows.tsx', 'M', 52, 31)],
  baseRef: 'main',
  inRepo: true,
};

const WORK_ITEM_ROW_SAMPLE = `import { Avatar } from '@/components/shared/primitives';
import type { WorkItem } from '@/types';

interface WorkItemRowProps {
  item: WorkItem;
  selected: boolean;
  onOpen: (id: number) => void;
}

/** One work item on the row grammar: icon, title, one meta line, one chip. */
export function WorkItemRow({ item, selected, onOpen }: WorkItemRowProps) {
  return (
    <div
      className="bd-wb-row"
      data-selected={selected ? 'true' : undefined}
      onClick={() => onOpen(item.id)}
    >
      <Avatar name={item.assignedTo} size={22} />
      <span className="bd-wb-row__text">
        <span className="bd-wb-row__title">{item.title}</span>
        <span className="bd-wb-row__meta">
          {item.type}, {item.state}, #{item.id}
        </span>
      </span>
      <span className="bd-wb-chip">{item.iteration}</span>
    </div>
  );
}
`;

function ManyResultsHarness({ params }: { params: FilePaletteStoryParams }) {
  applyParamsBeforeMount(params);
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <FilePaletteApp />
    </div>
  );
}

export const ManyResults: Story = {
  args: {
    params: {
      invokeResponses: loadedPalette({
        list_root_files: { entries: MANY_RESULTS_INDEX, truncated: false },
        git_changed_files: MANY_RESULTS_CHANGES,
        git_file_diff: sampleDiffOutput,
        read_text_file: WORK_ITEM_ROW_SAMPLE,
      }),
    },
  },
  parameters: { layout: 'fullscreen' },
  render: (args) => <ManyResultsHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, 'row');
    await canvas.findByText('src/components/work-items/WorkItemRow.tsx');
    // The selection resets when the changes rows arrive; let them land first.
    await new Promise((r) => setTimeout(r, 400));
    const rows = canvasElement.querySelectorAll('[data-file-result], .bd-fp-changes-row');
    const target = Array.from(rows).findIndex((r) =>
      r.textContent?.includes('src/components/work-items/WorkItemRow.tsx'),
    );
    for (let i = 0; i < Math.max(target, 0); i++) await userEvent.keyboard('{ArrowDown}');
    await canvas.findAllByTestId('code-line-row');
  },
};

// ---------------------------------------------------------------------------
// Both themes (plans/ui-overhaul-workbench.md, phase 6): the window on
// porcelain and on graphite, for the tool-window screenshots.
// ---------------------------------------------------------------------------

export const ThemeLight: Story = { ...DefaultMixed, globals: { theme: 'light' } };
export const ThemeDark: Story = { ...DefaultMixed, globals: { theme: 'dark' } };
