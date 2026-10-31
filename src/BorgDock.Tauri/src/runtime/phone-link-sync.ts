import { commands, events, type PhoneLinkChanged } from '@/generated/commands';
import * as activity from '@/services/activity/api';
import { configuredHosts } from '@/services/dispatch/hosts';
import { createLogger } from '@/services/logger';
import { commandData } from '@/services/native-command';
import {
  type CursorStore,
  forgetCursors,
  type PhoneLinkPort,
  shareReads,
  startCursorsAt,
  takeReads,
} from '@/services/phone-link/sync';
import type { LocalScope } from '@/services/phone-link/targets';
import { useSettingsStore } from '@/stores/settings-store';

const log = createLogger('phone-link');

/** Reads made here wait this long for more before they go. */
const SHARE_DEBOUNCE_MS = 2_000;
/** Reads from the phone, and the link state, are checked this often. */
const TAKE_MS = 60_000;

const port: PhoneLinkPort = {
  readSince: async (cursor, limit) =>
    (await commandData(commands.activityReadSince(cursor.readAt, cursor.id, limit))).map(
      activity.toEntry,
    ),
  sendReads: async (targets, before) => {
    await commandData(commands.phoneLinkSendReads(targets, before));
  },
  readsSince: (since) => commandData(commands.phoneLinkReadsSince(since)),
  markRead: async (entityKeys, before) => {
    await activity.mark({ ids: [], entityKeys, before, read: 'read', reason: 'phone' });
  },
};

const cursors: CursorStore = {
  get: (key) => localStorage.getItem(key),
  set: (key, value) => localStorage.setItem(key, value),
  remove: (key) => localStorage.removeItem(key),
};

function scope(): LocalScope {
  const settings = useSettingsStore.getState().settings;
  const { organization, project } = settings.azureDevOps;
  return {
    ado: organization && project ? { organization, project } : null,
    hostIds: configuredHosts(settings).map((host) => host.id),
  };
}

const sharing = () =>
  useSettingsStore.getState().settings.notifications.activity?.phoneLink?.shareReads !== false;

/** Before settings load, `shareReads` is the default, not what you saved. */
const settingsLoaded = () => useSettingsStore.getState().hasLoaded;

/**
 * Read sync with BorgDock for iPhone, main window only: reads made in any
 * window reach the journal, and the journal is what this shares. Presence
 * runs in Rust (`phone_link.rs`).
 */
export function startPhoneLinkSync(): () => void {
  let linked = false;
  let queue: Promise<unknown> = Promise.resolve();
  let shareTimer: ReturnType<typeof setTimeout> | undefined;
  const serial = (job: () => Promise<unknown>) => {
    queue = queue
      .then(job)
      .catch((error) => log.warn('phone link sync failed', { error: String(error) }));
  };

  const share = () =>
    serial(async () => {
      if (settingsLoaded() && linked && sharing())
        await shareReads(port, cursors, new Date().toISOString());
    });

  const tick = () =>
    serial(async () => {
      if (!settingsLoaded()) return;
      linked = (await commandData(commands.phoneLinkState())).linked;
      if (!linked || !sharing()) {
        forgetCursors(cursors);
        return;
      }
      const now = new Date().toISOString();
      await takeReads(port, cursors, scope(), now);
      await shareReads(port, cursors, now);
    });

  const onChanged = () => {
    clearTimeout(shareTimer);
    shareTimer = setTimeout(share, SHARE_DEBOUNCE_MS);
  };

  const onLinkChanged = ({ linked: nowLinked, at }: PhoneLinkChanged) => {
    if (nowLinked)
      serial(async () => {
        if (settingsLoaded() && sharing()) startCursorsAt(cursors, at);
      });
    tick();
  };

  let stopped = false;
  const unlisteners: (() => void)[] = [];
  const follow = (listening: Promise<() => void>) =>
    void listening
      .then((stop) => {
        if (stopped) stop();
        else unlisteners.push(stop);
      })
      .catch(() => {});
  follow(events.activityChanged.listen(onChanged));
  follow(events.phoneLinkChanged.listen((event) => onLinkChanged(event.payload)));

  tick();
  const timer = setInterval(tick, TAKE_MS);
  const unsubscribeSettings = useSettingsStore.subscribe((state, previous) => {
    if (
      state.hasLoaded !== previous.hasLoaded ||
      state.settings.notifications.activity?.phoneLink !==
        previous.settings.notifications.activity?.phoneLink
    ) {
      tick();
    }
  });

  return () => {
    stopped = true;
    for (const stop of unlisteners) stop();
    clearTimeout(shareTimer);
    clearInterval(timer);
    unsubscribeSettings();
  };
}
