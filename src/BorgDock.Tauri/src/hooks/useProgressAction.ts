import { useCallback, useEffect, useRef, useState } from 'react';
import { sendOsNotification } from '@/services/notification';
import { parseError } from '@/utils/parse-error';

/** `busy` while the request runs, `done` for a moment after it succeeded. */
export type ProgressState = 'idle' | 'busy' | 'done';

/** How long a button shows its result label before it returns to rest. */
export const PROGRESS_RESULT_MS = 1600;

export interface ProgressAction {
  state: ProgressState;
  /** Runs the action unless it is already running. */
  trigger: () => Promise<void>;
}

/**
 * useProgressAction — the state behind a button that fills while its request
 * is in flight and then flips to a result label (plans/ui-overhaul-workbench.md,
 * section 4: "Merge, Rerun, Fix"). `run` resolves `false` when it failed and
 * already told the user (the `services/pr-actions` functions toast through
 * their default error sink); a `run` that throws is toasted here under
 * `failureTitle`. Either way the button goes back to rest.
 */
export function useProgressAction(
  run: () => Promise<unknown>,
  failureTitle: string,
): ProgressAction {
  const [state, setState] = useState<ProgressState>('idle');
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<number | undefined>(undefined);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      window.clearTimeout(timerRef.current);
    };
  }, []);

  const trigger = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    window.clearTimeout(timerRef.current);
    setState('busy');
    let ok = false;
    try {
      ok = (await runRef.current()) !== false;
    } catch (err) {
      void sendOsNotification({
        title: failureTitle,
        body: parseError(err).message,
        severity: 'error',
      }).catch(() => {});
    }
    busyRef.current = false;
    if (!mountedRef.current) return;
    if (!ok) {
      setState('idle');
      return;
    }
    setState('done');
    timerRef.current = window.setTimeout(() => {
      if (mountedRef.current) setState('idle');
    }, PROGRESS_RESULT_MS);
  }, [failureTitle]);

  return { state, trigger };
}
