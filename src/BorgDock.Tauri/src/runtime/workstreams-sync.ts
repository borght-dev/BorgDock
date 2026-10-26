import { configuredHosts } from '@/services/dispatch/hosts';
import { dispatchAdoClient, followContextItems, syncItems } from '@/services/dispatch/sync';
import type { ItemOverview } from '@/services/dispatch/types';
import { getGitHubToken } from '@/services/github/auth';
import { isDue, lookUpPullRequests, targetKey } from '@/services/github/pr-lookup';
import { getClient, initClient } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import { PollingManager } from '@/services/polling';
import { assessWorkstream } from '@/services/workstreams/attention';
import { recordVerification, relinkMember } from '@/services/workstreams/edits';
import { type CachedMeta, cacheEntry, type SourceSnapshot } from '@/services/workstreams/resolve';
import {
  accountFor,
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
/** Transitions that failed to apply, so a broken one isn't retried on every change. */
const failedEdits = new Set<string>();

export function scheduleRecompute(): void {
  clearTimeout(recomputeTimer);
  recomputeTimer = setTimeout(recomputeWorkstreams, RECOMPUTE_DELAY_MS);
}

function polledPullRequests() {
  const { pullRequests, closedPullRequests } = usePrStore.getState();
  const polled = new Map<string, ReturnType<typeof toPolled>>();
  for (const entry of [...closedPullRequests, ...pullRequests]) {
    const pr = entry.pullRequest;
    polled.set(polledKey(pr.repoOwner, pr.repoName, pr.number), toPolled(entry));
  }
  return polled;
}

function buildSnapshot(now: number): SourceSnapshot {
  const dispatch = useDispatchStore.getState();
  const settings = useSettingsStore.getState().settings;
  const sources = useWorkstreamSourcesStore.getState();
  const items = new Map<number, ItemOverview>();
  for (const overview of [
    ...(dispatch.overview?.context ?? []),
    ...(dispatch.overview?.items ?? []),
  ]) {
    items.set(overview.item.id, overview);
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
    dispatch.threads,
    dispatch.hosts,
    dispatch.ado,
    prs.pullRequests,
    prs.closedPullRequests,
    prs.lastPollTime,
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
  applyFindings(assessments);
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

function clientFor(owner: string, repo: string, account: string | null) {
  const settings = useSettingsStore.getState().settings;
  const chosen = accountFor({ owner, repo, account }, settings.repos);
  if (!chosen) return getClient();
  const existing = getClient(chosen);
  if (existing) return existing;
  if (!getClient()) return null;
  const pat = settings.gitHub.personalAccessToken;
  return initClient(() => getGitHubToken(pat, chosen), chosen);
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
      const targets = pullRequestTargets(documents(), polled).filter((t) =>
        isDue(previous.get(targetKey(t)), now),
      );
      if (targets.length === 0 || !getClient()) continue;
      const accounts = new Map<string, string | null>();
      for (const target of targets) {
        const repository = `${target.owner}/${target.repo}`.toLowerCase();
        if (!accounts.get(repository)) accounts.set(repository, target.account);
      }
      const results = await lookUpPullRequests(
        targets,
        (owner, repo) =>
          clientFor(owner, repo, accounts.get(`${owner}/${repo}`.toLowerCase()) ?? null),
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
      if (
        state.pullRequests !== previous.pullRequests ||
        state.closedPullRequests !== previous.closedPullRequests
      ) {
        void lookUpWorkstreamPullRequests();
        scheduleRecompute();
      } else if (state.lastPollTime !== previous.lastPollTime) {
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
  const minute = window.setInterval(scheduleRecompute, 60_000);

  return () => {
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
