import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { emptyReviewDocument, type ReviewDocument } from '@/services/quick-review';
import type { PullRequestWithChecks } from '@/types';
import { reviewDraftStorage } from '@/utils/review-draft-storage';

export type ReviewDecision = 'approved' | 'commented' | 'skipped';
export type QuickReviewState = 'idle' | 'reviewing' | 'submitting' | 'error' | 'complete';

interface QuickReviewStoreState {
  state: QuickReviewState;
  queue: PullRequestWithChecks[];
  currentIndex: number;
  decisions: Map<number, ReviewDecision>;
  error: string | null;
  documents: Record<string, ReviewDocument>;
  updateDocument: (key: string, update: (doc: ReviewDocument) => ReviewDocument) => void;
  discardDocument: (key: string) => void;

  currentPr: () => PullRequestWithChecks | undefined;
  remaining: () => number;

  startSession: (prs: PullRequestWithChecks[]) => void;
  startSinglePr: (pr: PullRequestWithChecks) => void;
  advance: (decision: ReviewDecision) => void;
  goBack: () => void;
  setSubmitting: () => void;
  setError: (error: string) => void;
  clearError: () => void;
  endSession: () => void;
}

export const useQuickReviewStore = create<QuickReviewStoreState>()(
  persist(
    (set, get) => ({
      state: 'idle',
      queue: [],
      currentIndex: 0,
      decisions: new Map(),
      error: null,
      documents: {},
      updateDocument: (key, update) =>
        set((s) => ({
          documents: { ...s.documents, [key]: update(s.documents[key] ?? emptyReviewDocument) },
        })),
      discardDocument: (key) =>
        set((s) => {
          const documents = { ...s.documents };
          delete documents[key];
          return { documents };
        }),

      currentPr: () => {
        const { queue, currentIndex } = get();
        return queue[currentIndex];
      },

      remaining: () => {
        const { queue, currentIndex } = get();
        return Math.max(0, queue.length - currentIndex - 1);
      },

      startSession: (prs) => {
        if (prs.length === 0) return;
        set({
          state: 'reviewing',
          queue: prs,
          currentIndex: 0,
          decisions: new Map(),
          error: null,
        });
      },

      startSinglePr: (pr) => {
        set({
          state: 'reviewing',
          queue: [pr],
          currentIndex: 0,
          decisions: new Map(),
          error: null,
        });
      },

      advance: (decision) => {
        const { queue, currentIndex, decisions } = get();
        const pr = queue[currentIndex];
        if (pr) {
          const next = new Map(decisions);
          next.set(pr.pullRequest.number, decision);

          if (currentIndex >= queue.length - 1) {
            set({ state: 'complete', decisions: next, error: null });
          } else {
            set({
              state: 'reviewing',
              currentIndex: currentIndex + 1,
              decisions: next,
              error: null,
            });
          }
        }
      },

      goBack: () => {
        const { currentIndex } = get();
        if (currentIndex > 0) {
          set({ currentIndex: currentIndex - 1, state: 'reviewing', error: null });
        }
      },

      setSubmitting: () => set({ state: 'submitting', error: null }),

      setError: (error) => set({ state: 'error', error }),

      clearError: () => set({ state: 'reviewing', error: null }),

      endSession: () =>
        set({
          state: 'idle',
          queue: [],
          currentIndex: 0,
          decisions: new Map(),
          error: null,
        }),
    }),
    {
      name: 'borgdock:quick-review-drafts:v1',
      storage: createJSONStorage(() => reviewDraftStorage),
      partialize: (s) => ({ documents: s.documents }),
    },
  ),
);
