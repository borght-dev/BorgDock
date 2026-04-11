import { create } from 'zustand';

export type InitStepId = 'auth' | 'discover-repos' | 'fetch-prs' | 'fetch-checks';
export type InitStepState = 'waiting' | 'active' | 'done' | 'error';

export interface InitStep {
  id: InitStepId;
  label: string;
  activeLabel: string;
}

export const INIT_STEPS: InitStep[] = [
  { id: 'auth', label: 'Authenticated with gh CLI', activeLabel: 'Checking gh CLI auth' },
  {
    id: 'discover-repos',
    label: 'Discovered repositories',
    activeLabel: 'Discovering repositories',
  },
  {
    id: 'fetch-prs',
    label: 'Fetched open pull requests',
    activeLabel: 'Fetching open pull requests',
  },
  { id: 'fetch-checks', label: 'Loaded CI check status', activeLabel: 'Loading CI check status' },
];

interface InitState {
  currentStep: InitStepId | null;
  completedSteps: Record<string, { count?: number } | true>;
  error: { stepId: InitStepId; message: string } | null;
  isComplete: boolean;
  hasCompletedInitialLaunch: boolean;
  runToken: number;
  startStep: (id: InitStepId) => void;
  completeStep: (id: InitStepId, meta?: { count?: number }) => void;
  markComplete: () => void;
  failStep: (id: InitStepId, message: string) => void;
  reset: () => void;
}

const initialState = {
  currentStep: null as InitStepId | null,
  completedSteps: {} as Record<string, { count?: number } | true>,
  error: null as { stepId: InitStepId; message: string } | null,
  isComplete: false,
  hasCompletedInitialLaunch: false,
  runToken: 0,
};

export const useInitStore = create<InitState>()((set) => ({
  ...initialState,

  startStep: (id) => set({ currentStep: id, error: null }),

  completeStep: (id, meta) =>
    set((state) => ({
      completedSteps: {
        ...state.completedSteps,
        [id]: meta ?? true,
      },
      currentStep: state.currentStep === id ? null : state.currentStep,
    })),

  markComplete: () => set({ isComplete: true, hasCompletedInitialLaunch: true }),

  failStep: (id, message) => set({ currentStep: null, error: { stepId: id, message } }),

  reset: () => set((state) => ({
    ...initialState,
    runToken: state.runToken + 1,
    hasCompletedInitialLaunch: state.hasCompletedInitialLaunch,
  })),
}));
