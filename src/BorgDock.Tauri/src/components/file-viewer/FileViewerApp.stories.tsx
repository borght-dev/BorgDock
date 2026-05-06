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
