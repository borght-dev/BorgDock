// src/components/file-viewer/FileViewerApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { getControl } from '../../../.storybook/mocks/control';
import {
  DIFF_IN_REPO_NO_CHANGES,
  DIFF_NOT_IN_REPO,
  ERR_BINARY,
  ERR_NOT_FOUND,
  ERR_TOO_LARGE,
  LARGE_TS_SAMPLE,
  PATCH_ADD_ONLY_TS,
  PATCH_DELETE_ONLY_TS,
  PATCH_MULTI_HUNK_TS,
  PATCH_SINGLE_HUNK_TS,
  TSX_SAMPLE,
  makeSettings,
} from './__fixtures__/file-viewer-data';
import { FileViewerApp } from './FileViewerApp';
import type { AppSettings } from '@/types/settings';

interface DiffOutput {
  patch: string;
  baselineRef: string;
  inRepo: boolean;
}

interface FileViewerStoryParams {
  /** ?path query-string param. Set to null to omit it. Default: 'src/components/Counter.tsx'. */
  path?: string | null;
  /** ?baseline query-string param. */
  baseline?: 'HEAD' | 'mergeBaseDefault';
  /** Static content OR fn returning content / promise / rejection. */
  contentResponse?:
    | string
    | ((args: { path: string }) => string | Promise<string>);
  /** Custom load_settings response. Defaults to makeSettings(). */
  settings?: AppSettings;
  /** Static diff OR fn keyed on baseline. */
  diffResponse?:
    | DiffOutput
    | ((args: { path: string; baseline: string }) => DiffOutput | Promise<DiffOutput>);
  /** Override save_settings to capture/discard. Default: undefined (no-op resolve). */
  saveSettingsResponse?: unknown | ((args: unknown) => unknown);
}

const ORIGINAL_CLIPBOARD_WRITE_TEXT =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (navigator.clipboard as any)?.writeText?.bind(navigator.clipboard);

function applyParamsBeforeMount(params: FileViewerStoryParams) {
  const ctrl = getControl();

  // Default URL = src/components/Counter.tsx, no baseline override.
  const path = params.path === null ? null : (params.path ?? 'src/components/Counter.tsx');
  const search = new URLSearchParams();
  if (path !== null) search.set('path', path);
  if (params.baseline) search.set('baseline', params.baseline);
  const qs = search.toString();
  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}${qs ? `?${qs}` : ''}`,
  );

  // Canned invoke responses.
  ctrl.invokeResponses.load_settings = params.settings ?? makeSettings();
  ctrl.invokeResponses.save_settings =
    params.saveSettingsResponse !== undefined ? params.saveSettingsResponse : undefined;
  ctrl.invokeResponses.open_in_editor = undefined;

  // read_text_file: default to a simple TSX content. The function form
  // lets a story vary by path; static value is also fine.
  if (params.contentResponse !== undefined) {
    ctrl.invokeResponses.read_text_file = params.contentResponse;
  } else {
    ctrl.invokeResponses.read_text_file = TSX_SAMPLE;
  }

  // git_file_diff: default to "not in a git repo" to keep the surface
  // simple. Stories that exercise diff mode override this.
  if (params.diffResponse !== undefined) {
    ctrl.invokeResponses.git_file_diff = params.diffResponse;
  } else {
    ctrl.invokeResponses.git_file_diff = DIFF_NOT_IN_REPO;
  }

  // navigator.clipboard stub for stories that click "Copy all" — the
  // real Storybook iframe Chrome supports clipboard, but headless test
  // runs on some CI hosts don't. Stub if missing; restore on unmount.
  if (!('clipboard' in navigator) || typeof navigator.clipboard?.writeText !== 'function') {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (_text: string) => {} },
    });
  }
}

function restoreAfterMount() {
  // Reset URL — leave only the pathname.
  window.history.replaceState({}, '', window.location.pathname);
  if (ORIGINAL_CLIPBOARD_WRITE_TEXT) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator.clipboard as any).writeText = ORIGINAL_CLIPBOARD_WRITE_TEXT;
  }
}

function FileViewerHarness({ params }: { params: FileViewerStoryParams }) {
  applyParamsBeforeMount(params);

  useEffect(() => {
    return () => restoreAfterMount();
  }, []);

  return (
    <div style={{ width: 1200, height: 720 }}>
      <FileViewerApp />
    </div>
  );
}

const meta: Meta<typeof FileViewerHarness> = {
  title: 'File Viewer/FileViewerApp',
  component: FileViewerHarness,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<typeof FileViewerHarness>;

function story(params: FileViewerStoryParams = {}): Story {
  return { args: { params } };
}

// ---------------------------------------------------------------------------
// 1. Path / URL axis (3)
// ---------------------------------------------------------------------------

export const NoPathProvided = story({
  path: null,
  contentResponse: () => Promise.reject(new Error('should not be called')),
  diffResponse: () => Promise.reject(new Error('should not be called')),
});

export const PathTSXFile = story({
  path: 'src/components/Counter.tsx',
  contentResponse: TSX_SAMPLE,
  diffResponse: DIFF_NOT_IN_REPO,
});

export const LongPath = story({
  path:
    'src/very/deeply/nested/folder/structure/that/keeps/going/and/going/' +
    'until/the/path/is/much/longer/than/the/toolbar/can/comfortably/show/' +
    'and/we/want/to/verify/it/truncates/Counter.tsx',
  contentResponse: TSX_SAMPLE,
  diffResponse: DIFF_NOT_IN_REPO,
});

// ---------------------------------------------------------------------------
// 2. Content-load axis (4)
// ---------------------------------------------------------------------------

export const ContentLoading = story({
  contentResponse: () => new Promise<string>(() => {}),
  diffResponse: () => new Promise<DiffOutput>(() => {}),
});

export const ContentNotFound = story({
  contentResponse: () => Promise.reject(ERR_NOT_FOUND),
  diffResponse: DIFF_NOT_IN_REPO,
});

export const ContentBinary = story({
  contentResponse: () => Promise.reject(ERR_BINARY),
  diffResponse: DIFF_NOT_IN_REPO,
});

export const ContentTooLarge = story({
  contentResponse: () => Promise.reject(ERR_TOO_LARGE),
  diffResponse: DIFF_NOT_IN_REPO,
});

// ---------------------------------------------------------------------------
// 3. Mode-resolution axis (3)
// ---------------------------------------------------------------------------

export const NotInRepoPlainContent = story({
  contentResponse: TSX_SAMPLE,
  diffResponse: DIFF_NOT_IN_REPO,
});

export const InRepoNoChangesAutoToContent = story({
  contentResponse: TSX_SAMPLE,
  diffResponse: DIFF_IN_REPO_NO_CHANGES,
});

export const InRepoWithDiffAutoToDiff = story({
  contentResponse: TSX_SAMPLE,
  diffResponse: { patch: PATCH_SINGLE_HUNK_TS, baselineRef: 'HEAD', inRepo: true },
});

// ---------------------------------------------------------------------------
// 4. Diff view-mode axis (4)
// ---------------------------------------------------------------------------

export const UnifiedDiff = story({
  contentResponse: TSX_SAMPLE,
  diffResponse: { patch: PATCH_SINGLE_HUNK_TS, baselineRef: 'HEAD', inRepo: true },
});

export const SplitDiff = story({
  contentResponse: TSX_SAMPLE,
  diffResponse: { patch: PATCH_SINGLE_HUNK_TS, baselineRef: 'HEAD', inRepo: true },
  settings: makeSettings({ fileViewerDefaultViewMode: 'split' }),
});

export const UnifiedToSplitToggle: Story = {
  args: {
    params: {
      contentResponse: TSX_SAMPLE,
      diffResponse: { patch: PATCH_SINGLE_HUNK_TS, baselineRef: 'HEAD', inRepo: true },
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent, waitFor, expect } = await import('storybook/test');
    const canvas = within(canvasElement);
    const splitChip = await canvas.findByRole('button', { name: 'Split' });
    await userEvent.click(splitChip);
    await waitFor(() => {
      const ctrl = (window as unknown as {
        __borgdock_storybook_tauri: { invocations: Array<{ command: string; args?: unknown }> };
      }).__borgdock_storybook_tauri;
      const saved = ctrl.invocations.find((i) => i.command === 'save_settings');
      expect(saved).toBeTruthy();
    });
  },
};

export const DiffLoadError = story({
  contentResponse: TSX_SAMPLE,
  diffResponse: () => Promise.reject(new Error('git command failed')),
});

// ---------------------------------------------------------------------------
// 5. Baseline axis (3)
// ---------------------------------------------------------------------------

export const VsHEADActive = story({
  contentResponse: TSX_SAMPLE,
  diffResponse: { patch: PATCH_SINGLE_HUNK_TS, baselineRef: 'HEAD', inRepo: true },
});

export const VsMergeBaseDefault = story({
  baseline: 'mergeBaseDefault',
  contentResponse: TSX_SAMPLE,
  diffResponse: ({ baseline }) => ({
    patch: baseline === 'mergeBaseDefault' ? PATCH_SINGLE_HUNK_TS : '',
    baselineRef: baseline === 'mergeBaseDefault' ? 'main' : 'HEAD',
    inRepo: true,
  }),
});

export const BaselineSwitchInteraction: Story = {
  args: {
    params: {
      contentResponse: TSX_SAMPLE,
      diffResponse: ({ baseline }) => ({
        patch: PATCH_SINGLE_HUNK_TS,
        baselineRef: baseline === 'mergeBaseDefault' ? 'main' : 'HEAD',
        inRepo: true,
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent, waitFor, expect } = await import('storybook/test');
    const canvas = within(canvasElement);
    // Wait for the diff response to resolve so the chip's label updates from
    // 'vs default' to 'vs main' before we click it.
    const defaultChip = await canvas.findByRole('button', { name: /vs (default|main)/ });
    await userEvent.click(defaultChip);
    await waitFor(() => {
      const ctrl = (window as unknown as {
        __borgdock_storybook_tauri: { invocations: Array<{ command: string; args?: unknown }> };
      }).__borgdock_storybook_tauri;
      const calls = ctrl.invocations.filter(
        (i) =>
          i.command === 'git_file_diff' &&
          (i.args as { baseline?: string } | undefined)?.baseline === 'mergeBaseDefault',
      );
      expect(calls.length).toBeGreaterThan(0);
    });
  },
};

// ---------------------------------------------------------------------------
// 6. Toolbar action axis (4)
// ---------------------------------------------------------------------------

export const CopyAllSuccess: Story = {
  args: {
    params: {
      contentResponse: TSX_SAMPLE,
      diffResponse: DIFF_NOT_IN_REPO,
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent, waitFor } = await import('storybook/test');
    const canvas = within(canvasElement);
    // Wait for content to load — Copy all is disabled until then.
    const copyBtn = await canvas.findByRole('button', { name: 'Copy all' });
    await waitFor(() => {
      if ((copyBtn as HTMLButtonElement).disabled) throw new Error('not ready');
    });
    await userEvent.click(copyBtn);
    await canvas.findByRole('button', { name: 'Copied' });
  },
};

export const CopyAllDisabled: Story = {
  args: {
    params: {
      contentResponse: () => Promise.reject(ERR_NOT_FOUND),
      diffResponse: DIFF_NOT_IN_REPO,
    },
  },
  play: async ({ canvasElement }) => {
    const { within, waitFor, expect } = await import('storybook/test');
    const canvas = within(canvasElement);
    await waitFor(() => {
      const btn = canvas.getByRole('button', { name: 'Copy all' }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  },
};

export const OpenInEditorClicked: Story = {
  args: {
    params: {
      contentResponse: TSX_SAMPLE,
      diffResponse: DIFF_NOT_IN_REPO,
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent, waitFor, expect } = await import('storybook/test');
    const canvas = within(canvasElement);
    const btn = await canvas.findByRole('button', { name: 'Open in editor' });
    await userEvent.click(btn);
    await waitFor(() => {
      const ctrl = (window as unknown as {
        __borgdock_storybook_tauri: { invocations: Array<{ command: string; args?: unknown }> };
      }).__borgdock_storybook_tauri;
      const call = ctrl.invocations.find((i) => i.command === 'open_in_editor');
      expect(call).toBeTruthy();
      expect((call?.args as { path?: string } | undefined)?.path).toBeTruthy();
    });
  },
};

export const CloseClicked: Story = {
  args: {
    params: {
      contentResponse: TSX_SAMPLE,
      diffResponse: DIFF_NOT_IN_REPO,
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent, waitFor, expect } = await import('storybook/test');
    const canvas = within(canvasElement);
    const closeBtn = await canvas.findByRole('button', { name: /close/i });
    await userEvent.click(closeBtn);
    await waitFor(() => {
      const ctrl = (window as unknown as {
        __borgdock_storybook_tauri: { invocations: Array<{ command: string }> };
      }).__borgdock_storybook_tauri;
      const call = ctrl.invocations.find((i) => i.command === 'window.close');
      expect(call).toBeTruthy();
    });
  },
};

// ---------------------------------------------------------------------------
// 7. Diff content shape axis (3)
// ---------------------------------------------------------------------------

export const DiffAddOnly = story({
  path: 'src/lib/new-helper.ts',
  contentResponse: 'export function helper(x: number) { return x * 2; }\n',
  diffResponse: { patch: PATCH_ADD_ONLY_TS, baselineRef: 'HEAD', inRepo: true },
});

export const DiffDeleteOnly = story({
  path: 'src/lib/old-helper.ts',
  contentResponse: '',
  diffResponse: { patch: PATCH_DELETE_ONLY_TS, baselineRef: 'HEAD', inRepo: true },
});

export const DiffMultiHunk = story({
  path: 'src/services/api.ts',
  contentResponse: LARGE_TS_SAMPLE,
  diffResponse: { patch: PATCH_MULTI_HUNK_TS, baselineRef: 'HEAD', inRepo: true },
});

// ---------------------------------------------------------------------------
// 8. Syntax-highlight probe (1)
// ---------------------------------------------------------------------------

/**
 * The acceptance test for "tree-sitter wasm works in the Storybook iframe".
 * If either the runtime wasm (/web-tree-sitter.wasm) or the grammar wasm
 * (/grammars/tree-sitter-tsx.wasm) fails to load, the highlighter falls
 * back silently to plain spans — every character ends up inside a generic
 * <span>, with no `.hl-*` classes. This play function fails fast in that
 * case by asserting at least one element with a `.hl-*` class is present
 * after the highlighter resolves.
 */
export const ContentTSXSyntaxProbe: Story = {
  args: {
    params: {
      path: 'src/components/Counter.tsx',
      contentResponse: TSX_SAMPLE,
      diffResponse: DIFF_NOT_IN_REPO,
    },
  },
  play: async ({ canvasElement }) => {
    const { waitFor, expect } = await import('storybook/test');
    // The highlighter is async (wasm load + parse). Give it up to ~5s on
    // first run, but typical wall-time is sub-200ms once cached.
    await waitFor(
      () => {
        const hits = canvasElement.querySelectorAll(
          '.hl-keyword, .hl-string, .hl-tag, .hl-property',
        );
        expect(hits.length).toBeGreaterThan(0);
      },
      { timeout: 5000, interval: 100 },
    );
  },
};
