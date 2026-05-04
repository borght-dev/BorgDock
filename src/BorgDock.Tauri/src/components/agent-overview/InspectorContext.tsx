import { createContext, useContext } from 'react';
import type { InspectorState } from '@/hooks/useInspectorState';

export const InspectorContext = createContext<InspectorState | null>(null);

export function useInspector(): InspectorState {
  const v = useContext(InspectorContext);
  if (!v) throw new Error('useInspector must be used inside <InspectorContext.Provider>');
  return v;
}
