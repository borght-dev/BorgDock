import { create } from 'zustand';

interface UpdateState {
  available: boolean;
  version: string | null;
  downloading: boolean;
  progress: number;
  checking: boolean;
  statusText: string;
  currentVersion: string;
}

interface UpdateActions {
  setAvailable: (version: string) => void;
  setDownloading: (downloading: boolean) => void;
  setProgress: (progress: number) => void;
  setChecking: (checking: boolean) => void;
  setStatusText: (text: string) => void;
  setCurrentVersion: (version: string) => void;
  reset: () => void;
}

const initialState: UpdateState = {
  available: false,
  version: null,
  downloading: false,
  progress: 0,
  checking: false,
  statusText: '',
  currentVersion: '',
};

export const useUpdateStore = create<UpdateState & UpdateActions>((set) => ({
  ...initialState,
  setAvailable: (version) => set({ available: true, version }),
  setDownloading: (downloading) => set({ downloading }),
  setProgress: (progress) => set({ progress }),
  setChecking: (checking) => set({ checking }),
  setStatusText: (text) => set({ statusText: text }),
  setCurrentVersion: (version) => set({ currentVersion: version }),
  reset: () => set(initialState),
}));
