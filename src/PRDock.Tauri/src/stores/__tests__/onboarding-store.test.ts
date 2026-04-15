import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStoreInstance = {
  set: vi.fn(),
  get: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn().mockResolvedValue(mockStoreInstance),
  Store: { load: vi.fn().mockResolvedValue(mockStoreInstance) },
}));

// The persist() function in onboarding-store.ts uses a fire-and-forget dynamic
// import('@tauri-apps/plugin-store') that sometimes resolves to the real module
// (vitest quirk with dynamic imports in source modules). The real module calls
// window.__TAURI_INTERNALS__.invoke() which doesn't exist in jsdom.
// Set it up as a noop to prevent unhandled rejections.
beforeEach(() => {
  (window as Record<string, unknown>).__TAURI_INTERNALS__ = {
    invoke: vi.fn().mockResolvedValue(undefined),
    metadata: {},
  };
});

import type { BadgeId, HintId } from '../onboarding-store';
import { useOnboardingStore } from '../onboarding-store';

describe('onboarding-store', () => {
  beforeEach(() => {
    mockStoreInstance.set.mockClear();
    mockStoreInstance.get.mockClear();
    mockStoreInstance.save.mockClear();
    useOnboardingStore.setState({
      hasSeenFocusOverlay: false,
      dismissedBadges: new Set<BadgeId>(),
      dismissedHints: new Set<HintId>(),
    });
  });

  describe('initial state', () => {
    it('starts with defaults', () => {
      const s = useOnboardingStore.getState();
      expect(s.hasSeenFocusOverlay).toBe(false);
      expect(s.dismissedBadges.size).toBe(0);
      expect(s.dismissedHints.size).toBe(0);
    });
  });

  describe('markFocusOverlaySeen', () => {
    it('sets hasSeenFocusOverlay to true', () => {
      useOnboardingStore.getState().markFocusOverlaySeen();
      expect(useOnboardingStore.getState().hasSeenFocusOverlay).toBe(true);
    });
  });

  describe('dismissBadge', () => {
    it('adds badge to dismissed set', () => {
      useOnboardingStore.getState().dismissBadge('focus-mode');
      expect(useOnboardingStore.getState().dismissedBadges.has('focus-mode')).toBe(true);
    });

    it('can dismiss multiple badges', () => {
      useOnboardingStore.getState().dismissBadge('focus-mode');
      useOnboardingStore.getState().dismissBadge('pr-summary');
      const badges = useOnboardingStore.getState().dismissedBadges;
      expect(badges.has('focus-mode')).toBe(true);
      expect(badges.has('pr-summary')).toBe(true);
      expect(badges.size).toBe(2);
    });

    it('is idempotent for same badge', () => {
      useOnboardingStore.getState().dismissBadge('focus-mode');
      useOnboardingStore.getState().dismissBadge('focus-mode');
      expect(useOnboardingStore.getState().dismissedBadges.size).toBe(1);
    });
  });

  describe('dismissHint', () => {
    it('adds hint to dismissed set', () => {
      useOnboardingStore.getState().dismissHint('focus-priority-ranking');
      expect(useOnboardingStore.getState().dismissedHints.has('focus-priority-ranking')).toBe(true);
    });

    it('can dismiss multiple hints', () => {
      useOnboardingStore.getState().dismissHint('focus-priority-ranking');
      useOnboardingStore.getState().dismissHint('pr-summary-generate');
      useOnboardingStore.getState().dismissHint('review-mode-shortcuts');
      expect(useOnboardingStore.getState().dismissedHints.size).toBe(3);
    });

    it('is idempotent for same hint', () => {
      useOnboardingStore.getState().dismissHint('pr-summary-generate');
      useOnboardingStore.getState().dismissHint('pr-summary-generate');
      expect(useOnboardingStore.getState().dismissedHints.size).toBe(1);
    });
  });

  describe('resetAll', () => {
    it('resets all state to defaults', () => {
      useOnboardingStore.getState().markFocusOverlaySeen();
      useOnboardingStore.getState().dismissBadge('focus-mode');
      useOnboardingStore.getState().dismissHint('pr-summary-generate');

      useOnboardingStore.getState().resetAll();

      const s = useOnboardingStore.getState();
      expect(s.hasSeenFocusOverlay).toBe(false);
      expect(s.dismissedBadges.size).toBe(0);
      expect(s.dismissedHints.size).toBe(0);
    });
  });

  describe('restoreOnboardingState', () => {
    it('restores state from tauri store', async () => {
      mockStoreInstance.get.mockImplementation(async (key: string) => {
        if (key === 'hasSeenFocusOverlay') return true;
        if (key === 'dismissedBadges') return ['focus-mode', 'pr-summary'];
        if (key === 'dismissedHints') return ['review-mode-shortcuts'];
        return null;
      });

      await useOnboardingStore.getState().restoreOnboardingState();

      const s = useOnboardingStore.getState();
      expect(s.hasSeenFocusOverlay).toBe(true);
      expect(s.dismissedBadges.has('focus-mode')).toBe(true);
      expect(s.dismissedBadges.has('pr-summary')).toBe(true);
      expect(s.dismissedHints.has('review-mode-shortcuts')).toBe(true);
    });

    it('uses defaults when store values are null', async () => {
      mockStoreInstance.get.mockResolvedValue(null);

      await useOnboardingStore.getState().restoreOnboardingState();

      const s = useOnboardingStore.getState();
      expect(s.hasSeenFocusOverlay).toBe(false);
      expect(s.dismissedBadges.size).toBe(0);
      expect(s.dismissedHints.size).toBe(0);
    });

    it('keeps defaults when store load fails', async () => {
      const { load } = await import('@tauri-apps/plugin-store');
      (load as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Store unavailable'));

      await useOnboardingStore.getState().restoreOnboardingState();

      const s = useOnboardingStore.getState();
      expect(s.hasSeenFocusOverlay).toBe(false);
      expect(s.dismissedBadges.size).toBe(0);
    });
  });
});
