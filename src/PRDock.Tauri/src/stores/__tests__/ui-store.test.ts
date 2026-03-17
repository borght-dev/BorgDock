import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from '../ui-store';

describe('ui-store', () => {
  beforeEach(() => {
    useUiStore.setState({
      isSidebarVisible: true,
      isSettingsOpen: false,
      activeSection: 'prs',
      selectedPrNumber: null,
      expandedRepoGroups: new Set<string>(),
    });
  });

  describe('toggleSidebar', () => {
    it('toggles sidebar visibility', () => {
      expect(useUiStore.getState().isSidebarVisible).toBe(true);
      useUiStore.getState().toggleSidebar();
      expect(useUiStore.getState().isSidebarVisible).toBe(false);
      useUiStore.getState().toggleSidebar();
      expect(useUiStore.getState().isSidebarVisible).toBe(true);
    });

    it('sets sidebar visibility directly', () => {
      useUiStore.getState().setSidebarVisible(false);
      expect(useUiStore.getState().isSidebarVisible).toBe(false);
    });
  });

  describe('settings', () => {
    it('opens and closes settings', () => {
      useUiStore.getState().setSettingsOpen(true);
      expect(useUiStore.getState().isSettingsOpen).toBe(true);
      useUiStore.getState().setSettingsOpen(false);
      expect(useUiStore.getState().isSettingsOpen).toBe(false);
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
});
