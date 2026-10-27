import { commands } from '@/generated/commands';
import { commandData } from '@/services/native-command';
import type {
  CiBranchWatch,
  CiClaimOwner,
  CiClaimPatch,
  CiGroupPatch,
  CiRecordBatch,
} from './types';

/**
 * The CI failure store's commands, unwrapped. The store lives in Rust
 * (`ci-failures.db`); every window reads it, the main window's runtime is
 * the only writer of observations.
 */

export const record = (batch: CiRecordBatch) => commandData(commands.ciRecord(batch));
export const knownOccurrences = (scope: string, since: string) =>
  commandData(commands.ciKnownOccurrences(scope, since));
export const loadScope = (scopes: string[]) => commandData(commands.ciLoadScope(scopes));
export const loadPr = (scope: string, prNumber: number) =>
  commandData(commands.ciLoadPr(scope, prNumber));
export const loadGroup = (groupId: string) => commandData(commands.ciLoadGroup(groupId));
export const mergeGroups = (keep: string, merge: string, keepClaimOf: string | null) =>
  commandData(commands.ciMergeGroups(keep, merge, keepClaimOf));
export const splitFingerprint = (
  groupId: string,
  fingerprint: string,
  version: number,
  title: string,
) => commandData(commands.ciSplitFingerprint(groupId, fingerprint, version, title));
export const dismissCandidate = (groupA: string, groupB: string) =>
  commandData(commands.ciDismissCandidate(groupA, groupB));
export const setCandidateVerdict = (groupA: string, groupB: string, verdict: unknown) =>
  commandData(commands.ciSetCandidateVerdict(groupA, groupB, verdict as never));
export const setGroup = (id: string, patch: CiGroupPatch, expectedRevision: number) =>
  commandData(commands.ciSetGroup(id, patch, expectedRevision));
export const claim = (
  groupId: string,
  owner: CiClaimOwner,
  leaseUntil: string | null,
  note: string | null,
) => commandData(commands.ciClaim(groupId, owner, leaseUntil, note));
export const updateClaim = (
  claimId: string,
  expectedRevision: number,
  patch: CiClaimPatch,
  eventKind: string | null,
  eventDetail: string | null,
) => commandData(commands.ciUpdateClaim(claimId, expectedRevision, patch, eventKind, eventDetail));
export const claimEvent = (claimId: string, kind: string, detail: string | null) =>
  commandData(commands.ciClaimEvent(claimId, kind, detail));
export const usage = (day: string, account: string) => commandData(commands.ciUsage(day, account));
export const countUsage = (
  day: string,
  account: string,
  reads: number,
  logBytes: number,
  skipped: number,
) => commandData(commands.ciCountUsage(day, account, reads, logBytes, skipped));
export const branchWatch = (scope: string) => commandData(commands.ciBranchWatch(scope));
export const setBranchWatch = (rows: CiBranchWatch[]) =>
  commandData(commands.ciSetBranchWatch(rows));
export const retention = (
  activeScopes: string[],
  retentionDays: number,
  maxPerScope: number,
  inactiveGraceDays: number,
) => commandData(commands.ciRetention(activeScopes, retentionDays, maxPerScope, inactiveGraceDays));
export const clear = (keepDecisions: boolean) => commandData(commands.ciClear(keepDecisions));
export const storeInfo = () => commandData(commands.ciStoreInfo());
