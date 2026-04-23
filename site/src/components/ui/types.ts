/* Shared types for the BorgDock UI primitives.
   Mirrors the union types used in the real Tauri app so the mockups stay
   faithful to it. */

export type StatusKind = 'green' | 'red' | 'yellow' | 'gray';

export type PillVariant = 'success' | 'warning' | 'error' | 'accent';

export type ReviewState = 'approved' | 'changes' | null;

export interface ReasonFragment {
  kind: StatusKind | null;
  text: string;
}

export interface PillSpec {
  variant: PillVariant;
  text: string;
  icon?: React.ReactNode;
}
