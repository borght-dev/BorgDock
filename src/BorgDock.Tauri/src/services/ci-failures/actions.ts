import { viewed } from '@/services/activity/viewed';
import { configuredHosts, rawId, scopedId } from '@/services/dispatch/hosts';
import type { AgentThread } from '@/services/dispatch/types';
import { isMainWindow, MAIN_WINDOW_LABEL, showSection } from '@/services/navigation';
import { prScoreKey } from '@/services/priority-scoring';
import { t3SendMessage, t3ShowThread } from '@/services/t3/api';
import { type CiSheet, useCiSheetStore } from '@/stores/ci-investigate-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { parseScope } from './identity';
import { leaseUntil, type OwnerKind } from './ownership';
import { ciFailureSettings } from './settings';
import * as store from './store-api';
import type { CiClaim, CiClaimResult, CiGroupSummary } from './types';

/**
 * Everything the related-failures UI writes. Each function throws on failure
 * so the caller can say why inline: the pop-out window has no toasts.
 */

/** Ask the main window to filter its PR list to a group: `{ groupId, title, scope, prNumbers }`. */
export const SHOW_CI_GROUP_EVENT = 'ci-failures-show-group';
/** Ask the main window to open a related-failure sheet: a `CiSheet`. */
export const OPEN_CI_SHEET_EVENT = 'ci-failures-open-sheet';

export interface ShowGroupRequest {
  groupId: string;
  title: string;
  scope: string;
  prNumbers: readonly number[];
}

/**
 * Narrows the main window's PR list to the PRs of a group and shows it.
 * From another window, asks the main window to do it.
 */
export async function showGroupPrs(request: ShowGroupRequest): Promise<void> {
  if (!isMainWindow()) {
    const { emitTo } = await import('@tauri-apps/api/event');
    await emitTo(MAIN_WINDOW_LABEL, SHOW_CI_GROUP_EVENT, request);
    return;
  }
  viewed.ciGroup(request.groupId);
  const parts = parseScope(request.scope);
  const numbers = new Set(request.prNumbers);
  const prKeys = usePrStore
    .getState()
    .pullRequests.filter(
      (pr) =>
        !!parts &&
        numbers.has(pr.pullRequest.number) &&
        pr.pullRequest.repoOwner.toLowerCase() === parts.owner &&
        pr.pullRequest.repoName.toLowerCase() === parts.repo,
    )
    .map((pr) => prScoreKey(pr.pullRequest));
  usePrStore
    .getState()
    .setRelatedFailure({ groupId: request.groupId, title: request.title, prKeys });
  await showSection('prs');
}

/** Opens a related-failure sheet in the main window, where Dispatch's slots live. */
export async function openSheet(sheet: CiSheet): Promise<void> {
  if (!isMainWindow()) {
    const { emitTo } = await import('@tauri-apps/api/event');
    await emitTo(MAIN_WINDOW_LABEL, OPEN_CI_SHEET_EVENT, sheet);
    return;
  }
  useCiSheetStore.getState().open(sheet);
}

export interface NewOwner {
  kind: OwnerKind;
  ownerRef: string;
  label: string | null;
  hostId: string | null;
}

function leaseHours(): number {
  return ciFailureSettings(useSettingsStore.getState().settings).leaseHours;
}

function hostRefOf(hostId: string) {
  const host = configuredHosts(useSettingsStore.getState().settings).find((h) => h.id === hostId);
  return { id: hostId, baseUrl: host?.baseUrl };
}

/** Owners without a status (you, a terminal) get a lease; a T3 thread reports its own. */
function leaseFor(kind: OwnerKind, now: Date): string | null {
  return kind === 't3' || kind === 'github_issue' ? null : leaseUntil(now, leaseHours());
}

/** Claim `group` for `owner`. Resolves `alreadyClaimed` with the live claim when someone was first. */
export function claimGroup(
  group: Pick<CiGroupSummary, 'id'>,
  owner: NewOwner,
  note: string | null = null,
): Promise<CiClaimResult> {
  return store.claim(
    group.id,
    { kind: owner.kind, ownerRef: owner.ownerRef, label: owner.label, hostId: owner.hostId },
    leaseFor(owner.kind, new Date()),
    note,
  );
}

export function claimForMe(group: Pick<CiGroupSummary, 'id'>): Promise<CiClaimResult> {
  return claimGroup(group, { kind: 'me', ownerRef: 'me', label: null, hostId: null });
}

export function releaseClaim(claim: CiClaim, detail: string | null = null): Promise<CiClaim> {
  return store.updateClaim(claim.id, claim.revision, { state: 'released' }, 'released', detail);
}

/** "Still on it": the claim is confirmed and, for lease owners, extended. */
export function renewClaim(claim: CiClaim): Promise<CiClaim> {
  const kind = claim.ownerKind as OwnerKind;
  return store.updateClaim(
    claim.id,
    claim.revision,
    { state: 'active', leaseUntil: leaseFor(kind, new Date()) },
    'renewed',
    null,
  );
}

/** Marks the group resolved and closes its claim, if any. */
export async function resolveGroup(group: CiGroupSummary): Promise<void> {
  await store.setGroup(group.id, { status: 'resolved' }, group.revision);
  if (group.claim) {
    await store.updateClaim(
      group.claim.id,
      group.claim.revision,
      { state: 'resolved' },
      'resolved',
      null,
    );
  }
}

export function reopenGroup(group: CiGroupSummary) {
  return store.setGroup(group.id, { status: 'active' }, group.revision);
}

export function setClassification(group: CiGroupSummary, classification: string | null) {
  return store.setGroup(group.id, { classification }, group.revision);
}

export function setFixPr(group: CiGroupSummary, fixPr: string | null) {
  return store.setGroup(group.id, { fixPr, fixMergedAt: null }, group.revision);
}

/**
 * "Same cause": the older group keeps both. When both have an owner the
 * caller must name the one that stays.
 */
export function mergeGroups(
  a: CiGroupSummary,
  b: CiGroupSummary,
  keepClaimOf: string | null = null,
) {
  const [keep, merge] = a.firstObservedAt <= b.firstObservedAt ? [a, b] : [b, a];
  return store.mergeGroups(keep.id, merge.id, keepClaimOf);
}

export function notRelated(a: Pick<CiGroupSummary, 'id'>, b: Pick<CiGroupSummary, 'id'>) {
  const [groupA, groupB] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  return store.dismissCandidate(groupA, groupB);
}

export function splitFingerprint(
  group: CiGroupSummary,
  fingerprint: string,
  version: number,
  title: string,
) {
  return store.splitFingerprint(group.id, fingerprint, version, title);
}

/** Records that someone launched despite the owner. The claim itself is unchanged. */
export function recordOverride(claim: CiClaim, detail: string) {
  return store.claimEvent(claim.id, 'overridden', detail);
}

/** Brings the owner to the front: the T3 thread, or the tracking issue. */
export async function openOwner(claim: CiClaim): Promise<void> {
  if (claim.ownerKind === 'github_issue') {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(claim.ownerRef);
    return;
  }
  if (claim.ownerKind !== 't3') throw new Error('This owner has no window to open.');
  const hostId = claim.hostId ?? 'local';
  await t3ShowThread(
    hostRefOf(hostId),
    rawId(hostId, claim.ownerRef),
    useSettingsStore.getState().settings.agents?.t3Path,
  );
}

/** Tells the owning thread about another PR with the same failure. */
export async function sendToOwner(claim: CiClaim, message: string): Promise<void> {
  if (claim.ownerKind !== 't3') throw new Error('Only a T3 thread can receive a message.');
  const hostId = claim.hostId ?? 'local';
  await t3SendMessage(hostRefOf(hostId), rawId(hostId, claim.ownerRef), message, false);
}

/** Makes an existing T3 thread the owner of an unowned group. */
export function linkThread(
  group: Pick<CiGroupSummary, 'id'>,
  thread: Pick<AgentThread, 'id' | 'hostId' | 'title'>,
) {
  return claimGroup(group, {
    kind: 't3',
    ownerRef: scopedId(thread.hostId, rawId(thread.hostId, thread.id)),
    label: thread.title,
    hostId: thread.hostId,
  });
}

/** The message `Send this PR to the owner` posts. */
export function ownerMessage(
  pr: { number: number; url: string },
  jobUrl: string | null,
  excerpt: string | null,
): string {
  return [
    `Another PR shows the failure you are investigating: #${pr.number} (${pr.url}).`,
    jobUrl ? `Failed job: ${jobUrl}` : null,
    excerpt ? `Evidence:\n${excerpt}` : null,
    'Include it when you check the cause. Do not rerun or skip its checks.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
