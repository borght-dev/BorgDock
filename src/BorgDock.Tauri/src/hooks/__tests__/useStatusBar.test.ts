import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { useStatusBar } from '../useStatusBar';

describe('useStatusBar', () => {
  beforeEach(() => {
    useUiStore.setState({ viewStack: [{ kind: 'list' }] });
  });

  it('returns Focus copy', () => {
    const { result } = renderHook(() => useStatusBar('focus'));
    expect(result.current.left).toMatch(/focus/i);
    expect(result.current.right).toMatch(/Quick Review/i);
  });
  it('returns PRs copy with rate', () => {
    const { result } = renderHook(() => useStatusBar('prs'));
    expect(result.current.left).toMatch(/synced/i);
    expect(result.current.right).toMatch(/F7|F8|F9/);
  });
  it('returns Work Items copy', () => {
    const { result } = renderHook(() => useStatusBar('workitems'));
    expect(result.current.left).toMatch(/ado:/i);
  });
  it('returns Worktrees copy', () => {
    const { result } = renderHook(() => useStatusBar('worktrees'));
    expect(result.current.left).toBe('worktrees from every watched repository');
  });
  it('shows the back keys and the PR on a pull request detail view', () => {
    useUiStore.setState({
      viewStack: [{ kind: 'list' }, { kind: 'pr-detail', owner: 'octo', repo: 'app', number: 42 }],
    });
    const { result } = renderHook(() => useStatusBar('prs'));
    expect(result.current.left).toBe('octo/app #42');
    expect(result.current.right).toMatch(/Esc back/);
  });
  it('shows the back keys on a work item detail view', () => {
    useUiStore.setState({ viewStack: [{ kind: 'list' }, { kind: 'work-item-detail', id: 7 }] });
    const { result } = renderHook(() => useStatusBar('workitems'));
    expect(result.current.left).toMatch(/AB#7/);
    expect(result.current.right).toMatch(/Esc back/);
  });
  it('keeps the section copy on the list', () => {
    const { result } = renderHook(() => useStatusBar('prs'));
    expect(result.current.right).not.toMatch(/Esc/);
  });

  describe('list keys', () => {
    it('shows / search and R refresh on the PR list', () => {
      const { result } = renderHook(() => useStatusBar('prs'));
      expect(result.current.right).toBe(
        '/ search · R refresh · Ctrl+F7 worktrees · Ctrl+F8 files · Ctrl+F9 ADO',
      );
    });
    it('names the row keys on Work items', () => {
      const { result } = renderHook(() => useStatusBar('workitems'));
      expect(result.current.right).toBe('/ search · R refresh · J K move · Enter open');
    });
    it('shows / search, R refresh and the row keys on Worktrees, which has a search box', () => {
      const { result } = renderHook(() => useStatusBar('worktrees'));
      expect(result.current.right).toMatch(/^\/ search · R refresh · J K move /);
    });
    it('keeps R for Quick Review in Focus and names Ctrl+R for refresh', () => {
      const { result } = renderHook(() => useStatusBar('focus'));
      expect(result.current.right).toBe('R Quick Review · Ctrl+R refresh');
    });
    it('names the board keys when Focus shows the Board', () => {
      useSettingsStore.setState((s) => ({
        settings: { ...s.settings, ui: { ...s.settings.ui, focusLayout: 'board' } },
      }));
      const { result } = renderHook(() => useStatusBar('focus'));
      expect(result.current.right).toBe('J K move · H L columns · R Quick Review · Ctrl+R refresh');
      useSettingsStore.setState((s) => ({
        settings: { ...s.settings, ui: { ...s.settings.ui, focusLayout: 'list' } },
      }));
    });
  });
});
