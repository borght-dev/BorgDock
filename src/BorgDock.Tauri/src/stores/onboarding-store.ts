import { create } from 'zustand';

export type HintId = 'focus-priority-ranking' | 'pr-summary-generate' | 'review-mode-shortcuts';
export type BadgeId = 'focus-mode' | 'pr-summary' | 'review-mode';

interface OnboardingState {
  hasSeenFocusOverlay: boolean;
  dismissedBadges: Set<BadgeId>;
  dismissedHints: Set<HintId>;

  markFocusOverlaySeen: () => void;
  dismissBadge: (id: BadgeId) => void;
  dismissHint: (id: HintId) => void;
  resetAll: () => void;
  restoreOnboardingState: () => Promise<void>;
}

function persist(state: {
  hasSeenFocusOverlay: boolean;
  dismissedBadges: Set<BadgeId>;
  dismissedHints: Set<HintId>;
}) {
  // Skip when the Tauri runtime isn't available (jsdom under vitest, browser
  // preview, etc.). Without this guard the fire-and-forget dynamic import can
  // resolve to the real module after the test env is torn down, causing
  // unhandled rejections inside @tauri-apps/api/core's invoke().
  if (typeof window === 'undefined' || !(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
    return;
  }
  import('@tauri-apps/plugin-store')
    .then(({ load }) =>
      load('onboarding-state.json').then(async (store) => {
        await store.set('hasSeenFocusOverlay', state.hasSeenFocusOverlay);
        await store.set('dismissedBadges', [...state.dismissedBadges]);
        await store.set('dismissedHints', [...state.dismissedHints]);
        await store.save();
      }),
    )
    .catch((err) => console.warn('Failed to persist onboarding state:', err));
}

export const useOnboardingStore = create<OnboardingState>()((set, get) => ({
  hasSeenFocusOverlay: false,
  dismissedBadges: new Set<BadgeId>(),
  dismissedHints: new Set<HintId>(),

  markFocusOverlaySeen: () => {
    set({ hasSeenFocusOverlay: true });
    const s = get();
    persist(s);
  },

  dismissBadge: (id) => {
    set((state) => {
      const next = new Set(state.dismissedBadges);
      next.add(id);
      return { dismissedBadges: next };
    });
    const s = get();
    persist(s);
  },

  dismissHint: (id) => {
    set((state) => {
      const next = new Set(state.dismissedHints);
      next.add(id);
      return { dismissedHints: next };
    });
    const s = get();
    persist(s);
  },

  resetAll: () => {
    set({
      hasSeenFocusOverlay: false,
      dismissedBadges: new Set<BadgeId>(),
      dismissedHints: new Set<HintId>(),
    });
    const s = get();
    persist(s);
  },

  restoreOnboardingState: async () => {
    try {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load('onboarding-state.json');
      const hasSeenFocusOverlay = await store.get<boolean>('hasSeenFocusOverlay');
      const dismissedBadges = await store.get<BadgeId[]>('dismissedBadges');
      const dismissedHints = await store.get<HintId[]>('dismissedHints');
      set({
        hasSeenFocusOverlay: hasSeenFocusOverlay ?? false,
        dismissedBadges: new Set(dismissedBadges ?? []),
        dismissedHints: new Set(dismissedHints ?? []),
      });
    } catch {
      // First run or store unavailable — keep defaults
    }
  },
}));
