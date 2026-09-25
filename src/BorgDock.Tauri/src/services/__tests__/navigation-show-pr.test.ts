import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { openPrDetail, emitTo, invoke, mainWindow } = vi.hoisted(() => ({
  openPrDetail: vi.fn().mockResolvedValue(undefined),
  emitTo: vi.fn().mockResolvedValue(undefined),
  invoke: vi.fn().mockResolvedValue(undefined),
  mainWindow: {
    unminimize: vi.fn().mockResolvedValue(undefined),
    show: vi.fn().mockResolvedValue(undefined),
    setFocus: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/services/windows', () => ({ openPrDetail }));
vi.mock('@tauri-apps/api/event', () => ({ emitTo, listen: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => mainWindow }));
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(() => Promise.resolve()),
  readFromTauriStore: vi.fn(() => Promise.resolve(undefined)),
}));

import { openPrFromEvent } from '@/hooks/useFlyoutSync';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';
import { OPEN_PR_DETAIL_EVENT, showPr } from '../navigation';

const TARGET = { owner: 'acme', repo: 'app', number: 7 };
const settingsBefore = useSettingsStore.getState().settings;
const tauriWindow = window as unknown as { __TAURI_INTERNALS__?: unknown };

function inWindow(label: string) {
  tauriWindow.__TAURI_INTERNALS__ = { metadata: { currentWindow: { label } } };
}

describe('showPr', () => {
  beforeEach(() => {
    openPrDetail.mockClear();
    emitTo.mockClear();
    invoke.mockClear();
    useUiStore.setState({
      viewStack: [{ kind: 'list' }],
      activeSection: 'focus',
      selectedPrKey: null,
      selectedPrNumber: null,
    });
  });

  afterEach(() => {
    delete tauriWindow.__TAURI_INTERNALS__;
    useSettingsStore.setState({ settings: settingsBefore });
  });

  it('Pull requests, the row selected, the detail pushed, never the pop-out', async () => {
    await showPr(TARGET);
    const ui = useUiStore.getState();
    expect(openPrDetail).not.toHaveBeenCalled();
    expect(ui.activeSection).toBe('prs');
    expect(ui.selectedPrKey).toBe('acme/app#7');
    expect(ui.selectedPrNumber).toBe(7);
    expect(ui.viewStack).toEqual([{ kind: 'list' }, { kind: 'pr-detail', ...TARGET }]);
  });

  it('passes the tab as the initial tab', async () => {
    await showPr({ ...TARGET, tab: 'checks' });
    expect(useUiStore.getState().viewStack[1]).toEqual({
      kind: 'pr-detail',
      ...TARGET,
      initialTab: 'checks',
    });
  });

  it('replaces a PR detail on top instead of stacking another', async () => {
    await showPr(TARGET);
    await showPr({ owner: 'acme', repo: 'site', number: 3 });
    expect(useUiStore.getState().viewStack).toEqual([
      { kind: 'list' },
      { kind: 'pr-detail', owner: 'acme', repo: 'site', number: 3 },
    ]);
    expect(useUiStore.getState().selectedPrKey).toBe('acme/site#3');
  });

  it('leaves the same PR alone, and only switches its tab when asked', async () => {
    await showPr(TARGET);
    const stack = useUiStore.getState().viewStack;
    await showPr(TARGET);
    expect(useUiStore.getState().viewStack).toBe(stack);
    await showPr({ ...TARGET, tab: 'files' });
    expect(useUiStore.getState().viewStack).toEqual([
      { kind: 'list' },
      { kind: 'pr-detail', ...TARGET, initialTab: 'files' },
    ]);
  });

  it('stacks on top of a work item detail', async () => {
    useUiStore.setState({ viewStack: [{ kind: 'list' }, { kind: 'work-item-detail', id: 5 }] });
    await showPr(TARGET);
    expect(useUiStore.getState().viewStack).toHaveLength(3);
  });

  it('from the flyout: asks the main window instead of opening anything itself', async () => {
    inWindow('flyout');
    await showPr(TARGET);
    expect(emitTo).toHaveBeenCalledWith('main', OPEN_PR_DETAIL_EVENT, TARGET);
    expect(openPrDetail).not.toHaveBeenCalled();
    expect(useUiStore.getState().viewStack).toEqual([{ kind: 'list' }]);
  });

  it('in the main window (label "main") it acts itself', async () => {
    inWindow('main');
    await showPr(TARGET);
    expect(emitTo).not.toHaveBeenCalled();
    expect(useUiStore.getState().viewStack).toHaveLength(2);
  });
});

describe('open-pr-detail in the main window (openPrFromEvent)', () => {
  const listed = {
    pullRequest: { number: 7, repoOwner: 'acme', repoName: 'app' },
  } as unknown as PullRequestWithChecks;

  beforeEach(() => {
    openPrDetail.mockClear();
    invoke.mockClear();
    for (const fn of Object.values(mainWindow)) fn.mockClear();
    useUiStore.setState({ viewStack: [{ kind: 'list' }], activeSection: 'focus' });
    usePrStore.setState({ pullRequests: [listed] });
  });

  afterEach(() => {
    useSettingsStore.setState({ settings: settingsBefore });
    usePrStore.setState({ pullRequests: [] });
  });

  it('brings the main window forward and pushes the detail', async () => {
    await openPrFromEvent({ ...TARGET, tab: 'checks' });
    // Shown, restored and focused, never toggled (show_or_focus_main hides
    // a window that already has focus).
    expect(mainWindow.unminimize).toHaveBeenCalled();
    expect(mainWindow.show).toHaveBeenCalled();
    expect(mainWindow.setFocus).toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith('show_or_focus_main');
    expect(useUiStore.getState().viewStack[1]).toEqual({
      kind: 'pr-detail',
      ...TARGET,
      initialTab: 'checks',
    });
  });

  it('resolves owner and repo from the list for a number-only payload', async () => {
    await openPrFromEvent({ number: 7 });
    expect(openPrDetail).not.toHaveBeenCalled();
    expect(useUiStore.getState().viewStack[1]).toEqual({ kind: 'pr-detail', ...TARGET });
    useUiStore.setState({ viewStack: [{ kind: 'list' }] });
    for (const fn of Object.values(mainWindow)) fn.mockClear();
    await openPrFromEvent({ number: 99 });
    expect(useUiStore.getState().viewStack).toEqual([{ kind: 'list' }]);
    expect(mainWindow.show).not.toHaveBeenCalled();
  });
});
