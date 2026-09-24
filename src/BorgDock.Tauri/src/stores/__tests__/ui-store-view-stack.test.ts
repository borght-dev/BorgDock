import { beforeEach, describe, expect, it, vi } from 'vitest';

const readFromTauriStore = vi.fn();
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(() => Promise.resolve()),
  readFromTauriStore: (...args: unknown[]) => readFromTauriStore(...args),
}));

import {
  type MainView,
  SECTION_ORDER,
  selectTopView,
  selectViewDepth,
  useUiStore,
} from '../ui-store';

const PR: MainView = { kind: 'pr-detail', owner: 'octo', repo: 'app', number: 42 };
const WI: MainView = { kind: 'work-item-detail', id: 1234 };

describe('ui-store view stack', () => {
  beforeEach(() => {
    useUiStore.setState({
      viewStack: [{ kind: 'list' }],
      activeSection: 'focus',
      _hasUserNavigated: false,
    });
    readFromTauriStore.mockReset();
  });

  it('starts with the list view at depth 1', () => {
    const state = useUiStore.getState();
    expect(state.viewStack).toEqual([{ kind: 'list' }]);
    expect(selectTopView(state)).toEqual({ kind: 'list' });
    expect(selectViewDepth(state)).toBe(1);
  });

  it('pushes views on top of the list', () => {
    useUiStore.getState().pushView(PR);
    expect(selectTopView(useUiStore.getState())).toEqual(PR);
    useUiStore.getState().pushView(WI);
    expect(useUiStore.getState().viewStack).toEqual([{ kind: 'list' }, PR, WI]);
    expect(selectViewDepth(useUiStore.getState())).toBe(3);
  });

  it('pops back down to the list', () => {
    useUiStore.getState().pushView(PR);
    useUiStore.getState().pushView(WI);
    useUiStore.getState().popView();
    expect(selectTopView(useUiStore.getState())).toEqual(PR);
    useUiStore.getState().popView();
    expect(useUiStore.getState().viewStack).toEqual([{ kind: 'list' }]);
  });

  it('popView is a no-op at depth 1 and does not notify subscribers', () => {
    const before = useUiStore.getState().viewStack;
    const listener = vi.fn();
    const unsubscribe = useUiStore.subscribe(listener);
    useUiStore.getState().popView();
    unsubscribe();
    expect(useUiStore.getState().viewStack).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('replaceView swaps the top detail view', () => {
    useUiStore.getState().pushView(PR);
    useUiStore.getState().replaceView(WI);
    expect(useUiStore.getState().viewStack).toEqual([{ kind: 'list' }, WI]);
  });

  it('replaceView at depth 1 keeps the list at the bottom', () => {
    useUiStore.getState().replaceView(PR);
    expect(useUiStore.getState().viewStack).toEqual([{ kind: 'list' }, PR]);
  });

  it('replaceView with the list returns to the list', () => {
    useUiStore.getState().pushView(PR);
    useUiStore.getState().pushView(WI);
    useUiStore.getState().replaceView({ kind: 'list' });
    expect(useUiStore.getState().viewStack).toEqual([{ kind: 'list' }]);
  });

  it('pushing a view leaves the active section alone', () => {
    useUiStore.getState().setActiveSection('prs');
    useUiStore.getState().pushView(PR);
    useUiStore.getState().popView();
    expect(useUiStore.getState().activeSection).toBe('prs');
  });

  it('lists the sections in rail order, Worktrees last', () => {
    expect(SECTION_ORDER).toEqual(['focus', 'prs', 'workitems', 'worktrees']);
  });

  it('restores a persisted worktrees section', async () => {
    readFromTauriStore.mockImplementation((_store: string, key: string) =>
      Promise.resolve(key === 'activeSection' ? 'worktrees' : undefined),
    );
    useUiStore.getState().restorePersistedSection();
    await vi.waitFor(() => expect(useUiStore.getState().activeSection).toBe('worktrees'));
  });

  it('ignores an unknown persisted section', async () => {
    readFromTauriStore.mockImplementation((_store: string, key: string) =>
      Promise.resolve(key === 'activeSection' ? 'inbox' : undefined),
    );
    useUiStore.getState().restorePersistedSection();
    await Promise.resolve();
    await Promise.resolve();
    expect(useUiStore.getState().activeSection).toBe('focus');
  });
});
