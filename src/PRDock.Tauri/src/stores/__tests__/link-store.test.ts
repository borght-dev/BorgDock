import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkItem } from '@/types';
import { useLinkStore } from '../link-store';

function makeWorkItem(id: number): WorkItem {
  return {
    id,
    rev: 1,
    url: `https://dev.azure.com/org/project/_apis/wit/workItems/${id}`,
    fields: { 'System.Title': `Work Item ${id}` },
    relations: [],
    htmlUrl: `https://dev.azure.com/org/project/_workitems/edit/${id}`,
  };
}

describe('link-store', () => {
  beforeEach(() => {
    useLinkStore.setState({
      cache: new Map(),
    });
  });

  describe('initial state', () => {
    it('starts with empty cache', () => {
      expect(useLinkStore.getState().cache.size).toBe(0);
    });
  });

  describe('setWorkItem', () => {
    it('stores work item in cache', () => {
      const wi = makeWorkItem(42);
      useLinkStore.getState().setWorkItem(42, wi);

      const entry = useLinkStore.getState().cache.get(42);
      expect(entry).toBeDefined();
      expect(entry!.workItem.id).toBe(42);
      expect(entry!.fetchedAt).toBeGreaterThan(0);
    });

    it('overwrites existing entry', () => {
      const wi1 = makeWorkItem(1);
      const wi2 = { ...makeWorkItem(1), rev: 2 };

      useLinkStore.getState().setWorkItem(1, wi1);
      useLinkStore.getState().setWorkItem(1, wi2);

      expect(useLinkStore.getState().cache.get(1)!.workItem.rev).toBe(2);
    });

    it('stores multiple items independently', () => {
      useLinkStore.getState().setWorkItem(1, makeWorkItem(1));
      useLinkStore.getState().setWorkItem(2, makeWorkItem(2));

      expect(useLinkStore.getState().cache.size).toBe(2);
    });
  });

  describe('getWorkItem', () => {
    it('returns work item when in cache', () => {
      const wi = makeWorkItem(42);
      useLinkStore.getState().setWorkItem(42, wi);
      expect(useLinkStore.getState().getWorkItem(42)).toEqual(wi);
    });

    it('returns undefined when not in cache', () => {
      expect(useLinkStore.getState().getWorkItem(999)).toBeUndefined();
    });
  });

  describe('isFresh', () => {
    it('returns false for non-existent entry', () => {
      expect(useLinkStore.getState().isFresh(999)).toBe(false);
    });

    it('returns true for recently cached entry', () => {
      useLinkStore.getState().setWorkItem(1, makeWorkItem(1));
      expect(useLinkStore.getState().isFresh(1)).toBe(true);
    });

    it('returns false for stale entry', () => {
      useLinkStore.getState().setWorkItem(1, makeWorkItem(1));

      // Manually set fetchedAt to 10 minutes ago
      const cache = new Map(useLinkStore.getState().cache);
      const entry = cache.get(1)!;
      cache.set(1, { ...entry, fetchedAt: Date.now() - 10 * 60 * 1000 });
      useLinkStore.setState({ cache });

      // Default max age is 5 minutes
      expect(useLinkStore.getState().isFresh(1)).toBe(false);
    });

    it('respects custom maxAgeMs parameter', () => {
      useLinkStore.getState().setWorkItem(1, makeWorkItem(1));

      // Set fetchedAt to 2 seconds ago
      const cache = new Map(useLinkStore.getState().cache);
      const entry = cache.get(1)!;
      cache.set(1, { ...entry, fetchedAt: Date.now() - 2000 });
      useLinkStore.setState({ cache });

      // Fresh with 5-second window
      expect(useLinkStore.getState().isFresh(1, 5000)).toBe(true);
      // Not fresh with 1-second window
      expect(useLinkStore.getState().isFresh(1, 1000)).toBe(false);
    });

    it('considers just-cached items as fresh', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000000);
      useLinkStore.getState().setWorkItem(1, makeWorkItem(1));

      // isFresh checks Date.now() - fetchedAt < maxAge
      // With the same mocked time, the difference is 0
      expect(useLinkStore.getState().isFresh(1)).toBe(true);
      vi.restoreAllMocks();
    });
  });
});
