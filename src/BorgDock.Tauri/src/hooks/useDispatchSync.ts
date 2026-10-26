import { useEffect } from 'react';
import { startDispatchSync } from '@/runtime/dispatch-sync';

export { ITEM_ACTION_EVENT, SHOW_ITEM_EVENT } from '@/runtime/dispatch-sync';

export function useDispatchSync(enabled = true): void {
  useEffect(() => (enabled ? startDispatchSync() : undefined), [enabled]);
}
