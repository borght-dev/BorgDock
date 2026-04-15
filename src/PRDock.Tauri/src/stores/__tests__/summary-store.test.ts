import { beforeEach, describe, expect, it } from 'vitest';
import { summaryKey, useSummaryStore } from '../summary-store';

describe('summary-store', () => {
  beforeEach(() => {
    useSummaryStore.setState({
      cache: new Map(),
      loading: new Set(),
    });
  });

  describe('summaryKey helper', () => {
    it('creates key from owner/repo#number', () => {
      expect(summaryKey('acme', 'api', 42)).toBe('acme/api#42');
    });
  });

  describe('initial state', () => {
    it('starts with empty cache and loading', () => {
      const s = useSummaryStore.getState();
      expect(s.cache.size).toBe(0);
      expect(s.loading.size).toBe(0);
    });
  });

  describe('setSummary', () => {
    it('stores summary in cache', () => {
      useSummaryStore.getState().setSummary('acme/api#1', 'A great PR', '2025-01-01T00:00:00Z');
      const entry = useSummaryStore.getState().cache.get('acme/api#1');
      expect(entry).toBeDefined();
      expect(entry!.text).toBe('A great PR');
      expect(entry!.prUpdatedAt).toBe('2025-01-01T00:00:00Z');
      expect(entry!.generatedAt).toBeGreaterThan(0);
    });

    it('removes key from loading set', () => {
      useSummaryStore.getState().setLoading('acme/api#1', true);
      expect(useSummaryStore.getState().isLoading('acme/api#1')).toBe(true);

      useSummaryStore.getState().setSummary('acme/api#1', 'Summary', '2025-01-01T00:00:00Z');
      expect(useSummaryStore.getState().isLoading('acme/api#1')).toBe(false);
    });

    it('overwrites existing summary', () => {
      useSummaryStore.getState().setSummary('key', 'Old', '2025-01-01');
      useSummaryStore.getState().setSummary('key', 'New', '2025-01-02');
      expect(useSummaryStore.getState().cache.get('key')!.text).toBe('New');
    });
  });

  describe('getSummary', () => {
    it('returns summary text when fresh', () => {
      useSummaryStore.getState().setSummary('key', 'Fresh summary', '2025-01-01');
      const result = useSummaryStore.getState().getSummary('key', '2025-01-01');
      expect(result).toBe('Fresh summary');
    });

    it('returns undefined when key does not exist', () => {
      expect(useSummaryStore.getState().getSummary('missing', '2025-01-01')).toBeUndefined();
    });

    it('returns undefined when PR was updated after summary', () => {
      useSummaryStore.getState().setSummary('key', 'Stale', '2025-01-01');
      const result = useSummaryStore.getState().getSummary('key', '2025-01-02');
      expect(result).toBeUndefined();
    });

    it('returns text when prUpdatedAt matches exactly', () => {
      const ts = '2025-06-15T12:00:00Z';
      useSummaryStore.getState().setSummary('key', 'Match', ts);
      expect(useSummaryStore.getState().getSummary('key', ts)).toBe('Match');
    });
  });

  describe('isLoading / setLoading', () => {
    it('returns false for unknown key', () => {
      expect(useSummaryStore.getState().isLoading('unknown')).toBe(false);
    });

    it('sets loading to true', () => {
      useSummaryStore.getState().setLoading('key', true);
      expect(useSummaryStore.getState().isLoading('key')).toBe(true);
    });

    it('sets loading to false', () => {
      useSummaryStore.getState().setLoading('key', true);
      useSummaryStore.getState().setLoading('key', false);
      expect(useSummaryStore.getState().isLoading('key')).toBe(false);
    });

    it('tracks multiple keys independently', () => {
      useSummaryStore.getState().setLoading('a', true);
      useSummaryStore.getState().setLoading('b', true);
      useSummaryStore.getState().setLoading('a', false);

      expect(useSummaryStore.getState().isLoading('a')).toBe(false);
      expect(useSummaryStore.getState().isLoading('b')).toBe(true);
    });
  });

  describe('invalidate', () => {
    it('removes entry from cache', () => {
      useSummaryStore.getState().setSummary('key', 'Cached', '2025-01-01');
      useSummaryStore.getState().invalidate('key');
      expect(useSummaryStore.getState().cache.has('key')).toBe(false);
    });

    it('does nothing for non-existent key', () => {
      useSummaryStore.getState().setSummary('other', 'Keep', '2025-01-01');
      useSummaryStore.getState().invalidate('missing');
      expect(useSummaryStore.getState().cache.has('other')).toBe(true);
    });

    it('getSummary returns undefined after invalidation', () => {
      useSummaryStore.getState().setSummary('key', 'Cached', '2025-01-01');
      useSummaryStore.getState().invalidate('key');
      expect(useSummaryStore.getState().getSummary('key', '2025-01-01')).toBeUndefined();
    });
  });
});
