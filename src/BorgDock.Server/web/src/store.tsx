import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppConfig, Overview, WorkItemSummary } from '../../shared/src/api.ts';
import { api } from './api.ts';

export type Toast = { id: number; text: string; tone: 'ok' | 'error'; link?: { href: string; label: string } };

export type Route = { path: string; params: URLSearchParams };

type Store = {
  overview: Overview | null;
  config: AppConfig | null;
  loadError: string | null;
  route: Route;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  refresh: () => Promise<void>;
  /** Reads ADO and T3 again right now; bumps syncTick so open screens reload their own data too. */
  syncNow: () => Promise<void>;
  syncing: boolean;
  syncTick: number;
  toasts: Toast[];
  toast: (text: string, tone?: Toast['tone'], link?: Toast['link']) => void;
  /** Runs a write, reports the outcome, reloads the overview. Returns false when it failed. */
  act: (work: () => Promise<string | { text: string; link?: Toast['link'] } | void>) => Promise<boolean>;
  busy: boolean;
  startFor: WorkItemSummary | null;
  openStart: (item: WorkItemSummary | null) => void;
};

const StoreContext = createContext<Store | null>(null);

export const useStore = () => {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore outside StoreProvider');
  return store;
};

const currentRoute = (): Route => ({ path: location.pathname, params: new URLSearchParams(location.search) });

export function useRouter() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onPop = () => setRoute(currentRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    if (to === location.pathname + location.search) return;
    history[options?.replace ? 'replaceState' : 'pushState'](null, '', to);
    setRoute(currentRoute());
  }, []);
  return { route, navigate };
}

export function StoreProvider({ children, route, navigate }: { children: ReactNode; route: Route; navigate: Store['navigate'] }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(false);
  const [startFor, setStartFor] = useState<WorkItemSummary | null>(null);
  const nextToast = useRef(1);

  const [syncing, setSyncing] = useState(false);
  const [syncTick, setSyncTick] = useState(0);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      setOverview(await api.syncNow());
      setLoadError(null);
      setSyncTick((n) => n + 1);
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setSyncing(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setOverview(await api.overview());
      setLoadError(null);
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, []);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'ok', link?: Toast['link']) => {
    const id = nextToast.current++;
    setToasts((all) => [...all.slice(-2), { id, text, tone, link }]);
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), tone === 'error' ? 8000 : 5000);
  }, []);

  const act = useCallback<Store['act']>(async (work) => {
    setBusy(true);
    try {
      const result = await work();
      if (typeof result === 'string') toast(result);
      else if (result) toast(result.text, 'ok', result.link);
      await refresh();
      return true;
    } catch (error) {
      toast((error as Error).message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh, toast]);

  useEffect(() => {
    // Show the cached overview at once, then replace it with a fresh read (a page reload is the browser's pull to refresh).
    refresh().then(() => syncNow());
    api.config().then(setConfig).catch(() => {});
    // The server pushes "overview changed"; the poll is a safety net when the stream drops silently.
    const events = new EventSource('/api/events');
    events.addEventListener('overview', () => refresh());
    const poll = setInterval(refresh, 60_000);
    const onVisible = () => document.visibilityState === 'visible' && syncNow();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      events.close();
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, syncNow]);

  const value = useMemo<Store>(() => ({
    overview, config, loadError, route, navigate, refresh, syncNow, syncing, syncTick, toasts, toast, act, busy, startFor, openStart: setStartFor,
  }), [overview, config, loadError, route, navigate, refresh, syncNow, syncing, syncTick, toasts, toast, act, busy, startFor]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
