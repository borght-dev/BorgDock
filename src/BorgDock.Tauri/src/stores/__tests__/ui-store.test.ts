import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../ui-store';

describe('ui-store', () => {
  beforeEach(() => {
    useUiStore.setState({
      activeSection: 'prs',
      selectedPrNumber: null,
      expandedRepoGroups: new Set<string>(),
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

  describe('repo group expansion', () => {
    it('expands a repo group', () => {
      useUiStore.getState().toggleRepoGroup('owner/repo');
      expect(useUiStore.getState().expandedRepoGroups.has('owner/repo')).toBe(true);
    });

    it('collapses an expanded repo group', () => {
      useUiStore.getState().toggleRepoGroup('owner/repo');
      useUiStore.getState().toggleRepoGroup('owner/repo');
      expect(useUiStore.getState().expandedRepoGroups.has('owner/repo')).toBe(false);
    });

    it('tracks multiple expanded groups independently', () => {
      useUiStore.getState().toggleRepoGroup('a/one');
      useUiStore.getState().toggleRepoGroup('b/two');
      expect(useUiStore.getState().expandedRepoGroups.has('a/one')).toBe(true);
      expect(useUiStore.getState().expandedRepoGroups.has('b/two')).toBe(true);
      useUiStore.getState().toggleRepoGroup('a/one');
      expect(useUiStore.getState().expandedRepoGroups.has('a/one')).toBe(false);
      expect(useUiStore.getState().expandedRepoGroups.has('b/two')).toBe(true);
    });
  });

  describe('collapseAllRepoGroups', () => {
    it('clears all expanded repo groups', () => {
      useUiStore.setState({
        expandedRepoGroups: new Set(['owner/repo1', 'owner/repo2']),
      });
      useUiStore.getState().collapseAllRepoGroups();
      expect(useUiStore.getState().expandedRepoGroups.size).toBe(0);
    });
  });
});
