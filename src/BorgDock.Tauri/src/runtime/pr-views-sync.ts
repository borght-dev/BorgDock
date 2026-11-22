import {
  commands,
  events,
  type PhoneLinkChanged,
  type PhoneSavedPrView,
  type Value,
} from '@/generated/commands';
import { createLogger } from '@/services/logger';
import { commandData } from '@/services/native-command';
import { sanitizeSavedViews } from '@/services/pr-list/facets';
import {
  listAfterAnswer,
  planPull,
  planPush,
  type SharedView,
  sameViews,
  sanitizeViewsBase,
  type ViewsBase,
} from '@/services/pr-list/view-sync';
import { usePrViewStore } from '@/stores/pr-view-store';
import { useSettingsStore } from '@/stores/settings-store';
import { persistToTauriStore, readFromTauriStore } from '@/utils/tauri-persist';

const log = createLogger('pr-views-sync');

/** `ui-state.json` key, next to `prSavedViews`: the revision and views last read from or written to the server. */
export const PR_VIEWS_BASE_STORE_KEY = 'prViewsSyncBase';
/** The server's list is read this often while linked. */
const PULL_MS = 60_000;
/** A change here waits this long for more before it goes. */
const PUSH_DEBOUNCE_MS = 1_500;
/** Writes refused because another device wrote first, before this one waits for the next pull. */
const MAX_WRITES = 3;

const toWire = (views: readonly SharedView[]): PhoneSavedPrView[] =>
  views.map(({ id, name, filter, query, display }) => ({
    id,
    name,
    filter,
    query,
    display: display as Value,
  }));

const savedViews = (): SharedView[] => usePrViewStore.getState().savedViews;

/**
 * Saved pull request views shared with BorgDock for iPhone through its
 * server, main window only. Pulls every minute while linked, pushes a change
 * made here after a moment, and merges when the other side wrote first
 * (`services/pr-list/view-sync.ts`).
 */
export function startPrViewsSync(): () => void {
  let base: ViewsBase | null = null;
  let baseRead = false;
  /** Unknown until the first read of the server. */
  let linked: boolean | null = null;
  let applying = false;
  let lastError = '';
  let queue: Promise<unknown> = Promise.resolve();
  let pushTimer: ReturnType<typeof setTimeout> | undefined;

  const serial = (job: () => Promise<unknown>) => {
    queue = queue.then(job).then(
      () => {
        lastError = '';
      },
      (error) => {
        const text = String(error);
        if (text !== lastError) log.warn('saved view sync failed', { error: text });
        lastError = text;
      },
    );
  };

  /** Before settings load nothing runs; before the views load from disk the list is empty, not yours. */
  const ready = () => useSettingsStore.getState().hasLoaded && usePrViewStore.getState().restored;

  const loadBase = async () => {
    if (baseRead) return;
    base = sanitizeViewsBase(
      await readFromTauriStore<unknown>('ui-state.json', PR_VIEWS_BASE_STORE_KEY),
    );
    baseRead = true;
  };

  const setBase = (next: ViewsBase | null) => {
    base = next && { revision: next.revision, views: next.views };
    baseRead = true;
    persistToTauriStore('ui-state.json', PR_VIEWS_BASE_STORE_KEY, base).catch((error) =>
      log.debug('failed to persist the base', { error: String(error) }),
    );
  };

  /** The server's answer becomes the base, and the list here, with changes made meanwhile on top. */
  const adopt = (answer: ViewsBase, sent: SharedView[]) => {
    setBase(answer);
    const now = savedViews();
    const views = sanitizeSavedViews(listAfterAnswer(sent, now, answer.views));
    if (sameViews(views, now)) return;
    applying = true;
    try {
      usePrViewStore.getState().replaceSavedViews(views);
    } finally {
      applying = false;
    }
  };

  /** Writes the list; when another device wrote first, merges with what it wrote and writes again. */
  const write = async (sent: SharedView[], first: { views: SharedView[]; over: number }) => {
    let plan = first;
    for (let attempt = 1; ; attempt++) {
      const answer = await commandData(commands.phoneLinkPrViewsPut(plan.over, toWire(plan.views)));
      if (answer.status === 'saved') return adopt(answer.saved, sent);
      const next = planPull(base, sent, answer.current);
      if (next.kind === 'adopt') return adopt(answer.current, sent);
      if (attempt >= MAX_WRITES)
        throw new Error('saved views kept changing on another device; trying again next pull');
      plan = next;
    }
  };

  const pull = async () => {
    if (!ready()) return;
    await loadBase();
    const theirs = await commandData(commands.phoneLinkPrViewsGet());
    linked = theirs !== null;
    if (!theirs) {
      if (base) setBase(null);
      return;
    }
    const sent = savedViews();
    const plan = planPull(base, sent, theirs);
    if (plan.kind === 'adopt') adopt(theirs, sent);
    else await write(sent, plan);
  };

  const push = async () => {
    if (!ready() || linked === false) return;
    await loadBase();
    if (!base) return pull();
    const sent = savedViews();
    const plan = planPush(base, sent);
    if (plan) await write(sent, plan);
  };

  /** A new link merges both lists (no base); an unlink forgets the base. */
  const onLinkChanged = ({ linked: nowLinked }: PhoneLinkChanged) =>
    serial(async () => {
      linked = nowLinked;
      setBase(null);
      if (nowLinked) await pull();
    });

  let stopped = false;
  const unlisteners: (() => void)[] = [];
  void events.phoneLinkChanged
    .listen((event) => onLinkChanged(event.payload))
    .then((stop) => {
      if (stopped) stop();
      else unlisteners.push(stop);
    })
    .catch(() => {});

  const unsubscribeViews = usePrViewStore.subscribe((state, previous) => {
    if (state.restored && !previous.restored) serial(pull);
    else if (state.savedViews !== previous.savedViews && state.restored && !applying) {
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => serial(push), PUSH_DEBOUNCE_MS);
    }
  });
  const unsubscribeSettings = useSettingsStore.subscribe((state, previous) => {
    if (state.hasLoaded && !previous.hasLoaded) serial(pull);
  });

  serial(pull);
  const timer = setInterval(() => serial(pull), PULL_MS);

  return () => {
    stopped = true;
    for (const stop of unlisteners) stop();
    clearTimeout(pushTimer);
    clearInterval(timer);
    unsubscribeViews();
    unsubscribeSettings();
  };
}
