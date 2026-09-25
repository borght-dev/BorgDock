import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../ui-store';

describe('ui-store', () => {
  beforeEach(() => {
    useUiStore.setState({
      activeSection: 'prs',
      selectedPrNumber: null,
      collapsedGroups: new Set<string>(),
    });
  });

  describe('section switching', () => {
    it('switches active section', () => {
      expect(useUiStore.getState().activeSection).toBe('prs');
      useUiStore.getState().setActiveSection('workitems');
      expect(useUiStore.getState().activeSection).toBe('workitems');
      useUiStore.getState().setActiveSection('prs');
      expect(useUiStore.getState().activeSection).toBe('prs');
    });
  });

  describe('PR selection', () => {
    it('selects and deselects a PR', () => {
      useUiStore.getState().selectPr(42);
      expect(useUiStore.getState().selectedPrNumber).toBe(42);
      useUiStore.getState().selectPr(null);
      expect(useUiStore.getState().selectedPrNumber).toBeNull();
    });
  });

  describe('work item selection', () => {
    it('sets and reads workItemsSelectedId', () => {
      useUiStore.getState().setWorkItemsSelectedId(42);
      expect(useUiStore.getState().workItemsSelectedId).toBe(42);
      useUiStore.getState().setWorkItemsSelectedId(null);
      expect(useUiStore.getState().workItemsSelectedId).toBeNull();
    });
  });

  describe('group collapse', () => {
    it('collapses a group', () => {
      useUiStore.getState().toggleRepoGroup('owner/repo');
      expect(useUiStore.getState().collapsedGroups.has('owner/repo')).toBe(true);
    });

    it('opens a collapsed group again', () => {
      useUiStore.getState().toggleRepoGroup('owner/repo');
      useUiStore.getState().toggleRepoGroup('owner/repo');
      expect(useUiStore.getState().collapsedGroups.has('owner/repo')).toBe(false);
    });

    it('tracks multiple collapsed groups independently', () => {
      useUiStore.getState().toggleRepoGroup('a/one');
      useUiStore.getState().toggleRepoGroup('b/two');
      expect(useUiStore.getState().collapsedGroups.has('a/one')).toBe(true);
      expect(useUiStore.getState().collapsedGroups.has('b/two')).toBe(true);
      useUiStore.getState().toggleRepoGroup('a/one');
      expect(useUiStore.getState().collapsedGroups.has('a/one')).toBe(false);
      expect(useUiStore.getState().collapsedGroups.has('b/two')).toBe(true);
    });
  });

  describe('collapseAllRepoGroups', () => {
    it('collapses every given group and keeps the ones already collapsed', () => {
      useUiStore.setState({ collapsedGroups: new Set(['owner/repo1']) });
      useUiStore.getState().collapseAllRepoGroups(['needs-you', 'owner/repo2', 'owner/repo1']);
      expect([...useUiStore.getState().collapsedGroups].sort()).toEqual([
        'needs-you',
        'owner/repo1',
        'owner/repo2',
      ]);
    });

    it('never opens a group', () => {
      useUiStore.setState({ collapsedGroups: new Set(['a', 'b']) });
      useUiStore.getState().collapseAllRepoGroups([]);
      expect(useUiStore.getState().collapsedGroups).toEqual(new Set(['a', 'b']));
    });
  });
});
