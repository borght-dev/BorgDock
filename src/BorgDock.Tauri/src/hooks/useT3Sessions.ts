import { useEffect } from 'react';
import { followT3Sessions } from '@/runtime/t3-sessions';

export function useT3Sessions(enabled = true): void {
  useEffect(() => (enabled ? followT3Sessions() : undefined), [enabled]);
}
