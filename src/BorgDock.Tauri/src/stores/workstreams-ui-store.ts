import { create } from 'zustand';
import type { SourceRef } from '@/services/workstreams/types';

/** Records an "Add to workstream" brings along, ready to add. */
export interface PendingAdd {
  refs: { ref: SourceRef; label: string }[];
}

interface WorkstreamsUiState {
  /** The card the keyboard is on. */
  selectedId: string | null;
  /** The card whose next action is being typed. */
  editingNextAction: string | null;
  /** The "New workstream" sheet is open, with what it should start with. */
  creating: PendingAdd | null;
  /** The record picker is open for this workstream, maybe with records already chosen. */
  picking: { workstreamId: string; preset?: PendingAdd } | null;
  /** "Add to workstream" is open for these records: pick which workstream. */
  adding: PendingAdd | null;

  select: (id: string | null) => void;
  editNextAction: (id: string | null) => void;
  openCreate: (preset?: PendingAdd) => void;
  closeCreate: () => void;
  openPicker: (workstreamId: string, preset?: PendingAdd) => void;
  closePicker: () => void;
  openAdd: (records: PendingAdd) => void;
  closeAdd: () => void;
}

export const useWorkstreamsUiStore = create<WorkstreamsUiState>()((set) => ({
  selectedId: null,
  editingNextAction: null,
  creating: null,
  picking: null,
  adding: null,

  select: (selectedId) => set({ selectedId }),
  editNextAction: (editingNextAction) => set({ editingNextAction }),
  openCreate: (preset) => set({ creating: preset ?? { refs: [] } }),
  closeCreate: () => set({ creating: null }),
  openPicker: (workstreamId, preset) => set({ picking: { workstreamId, preset } }),
  closePicker: () => set({ picking: null }),
  openAdd: (adding) => set({ adding }),
  closeAdd: () => set({ adding: null }),
}));
