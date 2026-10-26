import { bringMainWindowForward } from '@/hooks/useFlyoutSync';
import { configuredHosts, rawId } from '@/services/dispatch/hosts';
import {
  dispatchAdoClient,
  everySourceRead,
  followContextItems,
  syncItems,
} from '@/services/dispatch/sync';
import type { ItemOverview } from '@/services/dispatch/types';
import { isDue, lookUpPullRequests, targetKey } from '@/services/github/pr-lookup';
import { getClient } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import { showWorkstream } from '@/services/navigation';
import { PollingManager } from '@/services/polling';
import { t3ThreadLastMessage } from '@/services/t3/api';
import { assessWorkstream } from '@/services/workstreams/attention';
import { parseProposal } from '@/services/workstreams/brief';
import {
  addProposal,
  markRunRead,
  recordVerification,
  relinkMember,
} from '@/services/workstreams/edits';
import { clientForPullRequest } from '@/services/workstreams/github-client';
import { prRefFromUrl } from '@/services/workstreams/identity';
import { ADD_TO_WORKSTREAM_EVENT, type AddRequest } from '@/services/workstreams/membership';
import {
  notifyWorkstreams,
  SHOW_WORKSTREAM_EVENT,
  workstreamNotices,
} from '@/services/workstreams/notifier';
import { type CachedMeta, cacheEntry, type SourceSnapshot } from '@/services/workstreams/resolve';
import {
  contextItemIds,
  polledKey,
  pullRequestTargets,
  toPolled,
} from '@/services/workstreams/sources';
import { suggestMembers } from '@/services/workstreams/suggest';
import type { RefKey } from '@/services/workstreams/types';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useWorkstreamSourcesStore } from '@/stores/workstream-sources-store';
import { settleWrites, useWorkstreamsStore } from '@/stores/workstreams-store';
import { useWorkstreamsUiStore } from '@/stores/workstreams-ui-store';
import { trackPolling } from './visibility';

const log = createLogger('workstreams');

/** A folder a sync client shares is looked at this often while BorgDock is visible. */
const FOLDER_POLL_MS = 15_000;
const RECOMPUTE_DELAY_MS = 30;
const ADO_POLL_MS = 60_000;

function documents() {
  return Object.values(useWorkstreamsStore.getState().entries).map((entry) => entry.document);
}

function folderSetting(): string | null {
  return useSettingsStore.getState().settings.workstreams?.folder?.trim() || null;
}

function deviceLabelSetting(): string | null {
  return useSettingsStore.getState().settings.workstreams?.deviceLabel?.trim() || null;
}

// ── Assessments ─────────────────────────────────────────────

let recomputeTimer: ReturnType<typeof setTimeout> | undefined;
let lastInputs: unknown[] | null = null;
/** Notifications wait for the first pass after loading, and for hosts that just came back. */
let notifiedOnce = false;
let hostsOk = new Map<string, boolean>();
/** Transitions that failed to apply, so a broken one isn't retried on every change. */
const failedEdits = new Set<string>();

export function scheduleRecompute(): void {
  clearTimeout(recomputeTimer);
  recomputeTimer = setTimeout(recomputeWorkstreams, RECOMPUTE_DELAY_MS);
}

/**
 * The open pull requests of the poll. The recently closed list is read once,
 * without reviews or checks, so closed ones are looked up instead.
 */
function polledPullRequests() {
  const { pullRequests, repoPolledAt } = usePrStore.getState();
  const polled = new Map<string, ReturnType<typeof toPolled>>();
  for (const entry of pullRequests) {
    const pr = entry.pullRequest;
    const at = repoPolledAt[`${pr.repoOwner}/${pr.repoName}`.toLowerCase()];
    polled.set(
      polledKey(pr.repoOwner, pr.repoName, pr.number),
      toPolled(entry, at ? new Date(at).toISOString() : null),
    );
  }
  return polled;
}

function buildSnapshot(now: number): SourceSnapshot {
  const dispatch = useDispatchStore.getState();
  const settings = useSettingsStore.getState().settings;
  const sources = useWorkstreamSourcesStore.getState();
  const items = new Map<number, ItemOverview>();
  const contextIds = new Set<number>();
  for (const overview of dispatch.overview?.context ?? []) {
    items.set(overview.item.id, overview);
    contextIds.add(overview.item.id);
  }
  // A Dispatch item's pull requests as the workstreams see them: a plan PR it
  // shares with context items is shared here, though Dispatch shows it as its own.
  const combined = dispatch.overview?.combinedPullRequests ?? {};
  for (const overview of dispatch.overview?.items ?? []) {
    const pullRequests = combined[overview.item.id];
    items.set(
      overview.item.id,
      pullRequests
        ? {
            ...overview,
            pullRequests,
            pullRequest: pullRequests.find((pr) => !pr.shared) ?? pullRequests[0] ?? null,
          }
        : overview,
    );
    contextIds.delete(overview.item.id);
  }
  const ado = settings.azureDevOps;
  const adoReady = !!ado.organization && (ado.authMethod === 'azCli' || !!ado.personalAccessToken);
  const lastPoll = usePrStore.getState().lastPollTime;
  return {
    now,
    ado: {
      organization: adoReady ? ado.organization : null,
      status: dispatch.ado,
      pollMs: Math.max(ADO_POLL_MS, (ado.pollIntervalSeconds ?? 60) * 1000),
    },
    items,
    contextIds,
    contextStatus: dispatch.contextStatus,
    missingItemIds: new Set(dispatch.missingItemIds),
    gitHub: {
      configured: settings.setupComplete && settings.repos.length > 0,
      lastPollAt: lastPoll ? lastPoll.toISOString() : null,
      pollMs: (settings.gitHub.pollIntervalSeconds || 60) * 1000,
    },
    polled: polledPullRequests(),
    lookedUp: sources.lookedUp,
    threads: new Map(dispatch.threads.map((thread) => [thread.id, thread])),
    hosts: dispatch.hosts,
    configuredHosts: new Set(configuredHosts(settings).map((host) => host.id)),
    cache: sources.cache,
  };
}

/** Rebuild every workstream's assessment from what the stores hold now. */
export function recomputeWorkstreams(): void {
  const workstreams = useWorkstreamsStore.getState();
  const dispatch = useDispatchStore.getState();
  const prs = usePrStore.getState();
  const sources = useWorkstreamSourcesStore.getState();
  const settings = useSettingsStore.getState().settings;
  const inputs = [
    workstreams.entries,
    workstreams.device.deviceLabel,
    dispatch.overview,
    dispatch.missingItemIds,
    dispatch.contextStatus,
    dispatch.threads,
    dispatch.hosts,
    dispatch.ado,
    prs.pullRequests,
    prs.lastPollTime,
    prs.repoPolledAt,
    sources.lookedUp,
    sources.cache,
    settings.azureDevOps,
    settings.agents?.t3Hosts,
    settings.setupComplete,
    settings.repos,
    Math.floor(Date.now() / 60_000),
  ];
  if (lastInputs && inputs.every((value, i) => value === lastInputs![i])) return;
  lastInputs = inputs;

  const now = Date.now();
  const snapshot = buildSnapshot(now);
  const device = workstreams.device.deviceLabel;
  const assessments: Record<string, ReturnType<typeof assessWorkstream>> = {};
  const suggestions: Record<string, ReturnType<typeof suggestMembers>> = {};
  const seen: Record<RefKey, CachedMeta> = {};
  for (const [id, entry] of Object.entries(workstreams.entries)) {
    const assessment = assessWorkstream(entry.document, snapshot, {
      now,
      device,
      conflict: entry.conflict !== null,
    });
    assessments[id] = assessment;
    suggestions[id] = suggestMembers(entry.document, assessment, {
      items: snapshot.items,
      hosts: snapshot.hosts,
    });
    for (const resolved of assessment.members.values()) {
      const meta = cacheEntry(resolved);
      if (meta) seen[resolved.member.key] = meta;
    }
  }
  useWorkstreamSourcesStore.getState().setAssessments(assessments, suggestions);
  useWorkstreamSourcesStore.getState().rememberMeta(seen);
  notify(assessments);
  applyFindings(assessments);
  void readProposals(assessments);
}

/** Review threads whose last message is being read, and when each was last asked for. */
const reading = new Set<string>();
const askedAt = new Map<string, number>();
const ASK_AGAIN_MS = 60_000;

/**
 * A review run that stopped (waiting on you, or settled): read its last
 * message once, keep the proposal it ends with, and mark the run read.
 */
async function readProposals(
  assessments: Record<string, ReturnType<typeof assessWorkstream>>,
): Promise<void> {
  const store = useWorkstreamsStore.getState;
  for (const [id, assessment] of Object.entries(assessments)) {
    const entry = store().entries[id];
    if (!entry || entry.readOnly || entry.conflict) continue;
    for (const run of entry.document.runs) {
      if (run.kind !== 'review' || run.read || reading.has(run.key)) continue;
      const thread = assessment.members.get(run.key)?.thread;
      if (!thread) continue;
      // A question or a plan is the agent asking on the way; the answer comes when it stops.
      const stopped =
        thread.status === 'your-turn' || thread.status === 'settled' || thread.status === 'failed';
      if (!thread.available || !stopped) continue;
      if (Date.now() - (askedAt.get(run.key) ?? 0) < ASK_AGAIN_MS) continue;
      askedAt.set(run.key, Date.now());
      reading.add(run.key);
      try {
        // Read whole: the proposal block closes the reply, past Dispatch's excerpt.
        const host = configuredHosts(useSettingsStore.getState().settings).find(
          (h) => h.id === thread.hostId,
        );
        const message = await t3ThreadLastMessage(
          { id: thread.hostId, baseUrl: host?.baseUrl },
          rawId(thread.hostId, thread.id),
        );
        if (!message) continue;
        const now = new Date().toISOString();
        const hosts = useDispatchStore.getState().hosts;
        const ado = useSettingsStore.getState().settings.azureDevOps;
        const document = store().entries[id]?.document;
        if (!document) continue;
        const proposal = parseProposal(message, document, run.key, now, {
          adoOrganization: ado.organization || null,
          adoProject: ado.project || null,
          environments: hosts.flatMap((h) =>
            h.environmentId ? [{ environmentId: h.environmentId, hostId: h.id }] : [],
          ),
        }) ?? {
          id: `${run.key}@${now}`,
          runKey: run.key,
          at: now,
          items: [],
          dropped: [],
          message: message.slice(0, 4_000),
        };
        store().edit(id, (d) => {
          const added = addProposal(d, proposal);
          return 'error' in added ? added : markRunRead(added.document, run.key);
        });
      } catch (error) {
        log.warn('review not read', { id, error: String(error) });
      } finally {
        reading.delete(run.key);
      }
    }
  }
}

function notify(assessments: Record<string, ReturnType<typeof assessWorkstream>>): void {
  const store = useWorkstreamsStore.getState();
  if (!store.loaded) return;
  const hosts = useDispatchStore.getState().hosts;
  const cameBack = hosts.some((host) => host.ok && hostsOk.get(host.id) === false);
  hostsOk = new Map(hosts.map((host) => [host.id, host.ok]));
  const quiet = !notifiedOnce || !everySourceRead() || cameBack;
  notifiedOnce = true;
  const enabled = useSettingsStore.getState().settings.workstreams?.notifications ?? true;
  const documents = Object.values(store.entries).map((entry) => entry.document);
  notifyWorkstreams(workstreamNotices(documents, assessments), quiet, enabled);
}

/** Listen to the other windows: a pop-out adds records, a notification opens a workstream. */
async function listenToOtherWindows(): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  const stops = await Promise.all([
    listen<AddRequest>(ADD_TO_WORKSTREAM_EVENT, (event) => {
      void bringMainWindowForward().then(() =>
        useWorkstreamsUiStore.getState().openAdd(event.payload),
      );
    }),
    listen<{ id: string }>(SHOW_WORKSTREAM_EVENT, (event) => {
      void bringMainWindowForward().then(() => showWorkstream(event.payload.id));
    }),
  ]);
  return () => {
    for (const stop of stops) stop();
  };
}

/** Write down what the rules found and what GitHub renamed. */
function applyFindings(assessments: Record<string, ReturnType<typeof assessWorkstream>>): void {
  const store = useWorkstreamsStore.getState();
  for (const [id, assessment] of Object.entries(assessments)) {
    const entry = store.entries[id];
    if (!entry || entry.readOnly || entry.conflict || entry.document.status === 'archived')
      continue;
    for (const transition of assessment.transitions) {
      const key = `${id}:${transition.outcomeId}:${transition.verification.state}`;
      if (failedEdits.has(key)) continue;
      const error = store.edit(id, (document, context) =>
        recordVerification(document, transition.outcomeId, transition.verification, context),
      );
      if (error) {
        failedEdits.add(key);
        log.warn('verification not recorded', { id, error });
      }
    }
    for (const relink of assessment.relinks) {
      const key = `${id}:relink:${relink.key}`;
      if (failedEdits.has(key)) continue;
      const error = store.edit(id, (document, context) =>
        relinkMember(document, relink.key, relink.ref, context),
      );
      if (error) failedEdits.add(key);
    }
  }
}

// ── Sources ─────────────────────────────────────────────────

let lookupInFlight: Promise<void> | null = null;
let lookupAgain = false;

/**
 * The own pull request of every work item a workstream links, when BorgDock
 * doesn't poll it: "item delivered" needs it read, not remembered.
 */
function deliveryTargets(polled: ReadonlySet<string>) {
  const overview = useDispatchStore.getState().overview;
  if (!overview) return [];
  const byId = new Map([...(overview.context ?? []), ...overview.items].map((o) => [o.item.id, o]));
  const combined = overview.combinedPullRequests ?? {};
  const targets: { owner: string; repo: string; number: number; account: string | null }[] = [];
  for (const document of documents()) {
    if (document.status === 'archived') continue;
    for (const member of document.members) {
      if (member.ref.kind !== 'ado-item') continue;
      const found = byId.get(member.ref.id);
      const pullRequests = combined[member.ref.id] ?? found?.pullRequests ?? [];
      const own = pullRequests.find((pr) => !pr.shared);
      const ref = own ? prRefFromUrl(own.url) : null;
      if (!ref || polled.has(polledKey(ref.owner, ref.repo, ref.number))) continue;
      targets.push({ owner: ref.owner, repo: ref.repo, number: ref.number, account: null });
    }
  }
  return targets;
}

/** Read the linked pull requests BorgDock doesn't poll, when they are due. */
export function lookUpWorkstreamPullRequests(): Promise<void> {
  if (lookupInFlight) {
    lookupAgain = true;
    return lookupInFlight;
  }
  const job = (async () => {
    do {
      lookupAgain = false;
      const polled = new Set(polledPullRequests().keys());
      const previous = useWorkstreamSourcesStore.getState().lookedUp;
      const now = Date.now();
      const wanted = [...pullRequestTargets(documents(), polled), ...deliveryTargets(polled)];
      const unique = new Map(wanted.map((t) => [targetKey(t), t]));
      const targets = [...unique.values()].filter((t) => isDue(previous.get(targetKey(t)), now));
      if (targets.length === 0 || !getClient()) continue;
      const accounts = new Map<string, string | null>();
      for (const target of targets) {
        const repository = `${target.owner}/${target.repo}`.toLowerCase();
        if (!accounts.get(repository)) accounts.set(repository, target.account);
      }
      const results = await lookUpPullRequests(
        targets,
        (owner, repo) =>
          clientForPullRequest(owner, repo, accounts.get(`${owner}/${repo}`.toLowerCase()) ?? null),
        previous,
        now,
      );
      useWorkstreamSourcesStore.getState().mergeLookups(results);
    } while (lookupAgain);
  })()
    .catch((error) => log.warn('workstream pull requests not read', { error: String(error) }))
    .finally(() => {
      if (lookupInFlight === job) lookupInFlight = null;
    });
  lookupInFlight = job;
  return job;
}

let lastContextIds = '';

/** A workstream linked an item Dispatch doesn't have yet: read the items again. */
function followNewItems(): void {
  const ids = contextItemIds(
    documents(),
    useSettingsStore.getState().settings.azureDevOps.organization || null,
  );
  const signature = ids.join(',');
  if (signature === lastContextIds) return;
  const known = new Set([
    ...useDispatchStore.getState().items.map((item) => item.id),
    ...useDispatchStore.getState().contextItems.map((item) => item.id),
    ...useDispatchStore.getState().missingItemIds,
  ]);
  const grew = ids.some((id) => !known.has(id));
  lastContextIds = signature;
  if (grew && dispatchAdoClient()) void syncItems(true);
}

function accountSignature(): string {
  return useSettingsStore
    .getState()
    .settings.repos.map((r) => `${r.owner}/${r.name}:${r.githubAccount ?? ''}`)
    .join('|');
}

/**
 * Keeps the workstreams current: loads them from their folder, rereads the
 * folder while BorgDock is visible, reads what Dispatch and the PR poll
 * don't, and rebuilds every assessment when one of its inputs changes. It
 * starts no poll of its own on any source.
 */
export function startWorkstreamsSync(): () => void {
  const store = useWorkstreamsStore.getState;
  /** `undefined` until settings are loaded: the folder is a setting. */
  let folder: string | null | undefined;
  let accounts = accountSignature();
  const begin = () => {
    folder = folderSetting();
    accounts = accountSignature();
    store().setDeviceLabel(deviceLabelSetting());
    void store()
      .load(folder)
      .then(() => {
        followNewItems();
        void lookUpWorkstreamPullRequests();
        scheduleRecompute();
      });
  };
  void useWorkstreamSourcesStore.getState().restoreCache().then(scheduleRecompute);
  if (useSettingsStore.getState().hasLoaded) begin();
  followContextItems(() =>
    contextItemIds(
      documents(),
      useSettingsStore.getState().settings.azureDevOps.organization || null,
    ),
  );

  const folderPoll = new PollingManager(() => store().refresh(), FOLDER_POLL_MS);
  const untrack = trackPolling(folderPoll);
  folderPoll.startDeferred();
  const onFocus = () => void store().refresh();
  window.addEventListener('focus', onFocus);

  const unsubscribers = [
    useWorkstreamsStore.subscribe((state, previous) => {
      if (state.entries === previous.entries) return;
      followNewItems();
      void lookUpWorkstreamPullRequests();
      scheduleRecompute();
    }),
    useDispatchStore.subscribe((state, previous) => {
      if (
        state.overview !== previous.overview ||
        state.threads !== previous.threads ||
        state.hosts !== previous.hosts ||
        state.ado !== previous.ado ||
        state.missingItemIds !== previous.missingItemIds
      ) {
        scheduleRecompute();
      }
    }),
    usePrStore.subscribe((state, previous) => {
      // Every accepted poll: what is due is read again, even when nothing changed.
      if (
        state.pullRequests !== previous.pullRequests ||
        state.lastPollTime !== previous.lastPollTime
      ) {
        void lookUpWorkstreamPullRequests();
        scheduleRecompute();
      }
    }),
    useWorkstreamSourcesStore.subscribe((state, previous) => {
      if (state.lookedUp !== previous.lookedUp || state.cache !== previous.cache)
        scheduleRecompute();
    }),
    useSettingsStore.subscribe((state, previous) => {
      if (folder === undefined) {
        if (state.hasLoaded) begin();
        return;
      }
      const settings = state.settings;
      if (settings.workstreams?.deviceLabel !== previous.settings.workstreams?.deviceLabel) {
        store().setDeviceLabel(deviceLabelSetting());
      }
      const nextFolder = folderSetting();
      if (nextFolder !== folder) {
        folder = nextFolder;
        void settleWrites().then(() => store().load(nextFolder));
      }
      const nextAccounts = accountSignature();
      if (nextAccounts !== accounts) {
        accounts = nextAccounts;
        useWorkstreamSourcesStore.getState().clearLookups();
        void lookUpWorkstreamPullRequests();
      }
      scheduleRecompute();
    }),
  ];
  const minute = window.setInterval(() => {
    void lookUpWorkstreamPullRequests();
    scheduleRecompute();
  }, 60_000);
  let stopListening: (() => void) | undefined;
  let stopped = false;
  listenToOtherWindows()
    .then((stop) => {
      if (stopped) stop();
      else stopListening = stop;
    })
    .catch(() => {});

  return () => {
    stopped = true;
    stopListening?.();
    notifiedOnce = false;
    folderPoll.stop();
    untrack();
    window.removeEventListener('focus', onFocus);
    window.clearInterval(minute);
    clearTimeout(recomputeTimer);
    followContextItems(() => []);
    for (const unsubscribe of unsubscribers) unsubscribe();
    lastInputs = null;
  };
}
