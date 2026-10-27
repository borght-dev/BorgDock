import { candidateReasons, type Facets, type Fingerprint } from './fingerprint';

/** A fingerprint the store already maps to a group. */
export interface IndexedFingerprint {
  fingerprint: string;
  groupId: string;
  facets: Facets;
}

/** A `same cause` decision that outlives the fingerprints it names (retention may purge them). */
export interface LinkDecision {
  fingerprintA: string;
  fingerprintB: string;
}

export interface IncomingSignal {
  occurrenceId: string;
  ordinal: number;
  fingerprint: Fingerprint;
  observedAt: string;
  /** When re-fingerprinting after a rules change: the group the signal belonged to before. */
  previousGroup?: string | null;
}

export interface NewGroup {
  id: string;
  title: string;
  firstObservedAt: string;
}

export interface FingerprintMapping {
  fingerprint: string;
  groupId: string;
  facets: Facets;
}

export interface CandidateLink {
  groupA: string;
  groupB: string;
  reasons: string[];
}

export interface Assignment {
  newGroups: NewGroup[];
  /** Mappings for fingerprints the index didn't have. Existing ones never move here. */
  mappings: FingerprintMapping[];
  /** Medium links from a new fingerprint's group to another group, `groupA < groupB`. */
  candidates: CandidateLink[];
}

/**
 * Puts each incoming high or medium fingerprint in a group: the group that
 * already owns it, the group a `same cause` decision ties it to, the group
 * most of its signals belonged to before a rules change, or a new one.
 * Low-tier fingerprints get no group. Only new fingerprints create candidate
 * links, so re-recording known failures adds nothing.
 */
export function assign(
  index: readonly IndexedFingerprint[],
  links: readonly LinkDecision[],
  incoming: readonly IncomingSignal[],
  newId: () => string = () => crypto.randomUUID(),
): Assignment {
  const owner = new Map(index.map((entry) => [entry.fingerprint, entry.groupId]));
  const linked = new Map<string, string[]>();
  for (const { fingerprintA, fingerprintB } of links) {
    linked.set(fingerprintA, [...(linked.get(fingerprintA) ?? []), fingerprintB]);
    linked.set(fingerprintB, [...(linked.get(fingerprintB) ?? []), fingerprintA]);
  }
  const previous = previousMajority(incoming);
  const known: IndexedFingerprint[] = [...index];
  const newGroups: NewGroup[] = [];
  const mappings: FingerprintMapping[] = [];
  const candidates = new Map<string, CandidateLink>();

  const ordered = [...incoming].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  for (const { fingerprint, observedAt } of ordered) {
    if (fingerprint.tier === 'low' || owner.has(fingerprint.value)) continue;
    const tiedGroup = (linked.get(fingerprint.value) ?? [])
      .map((other) => owner.get(other))
      .find((group): group is string => group !== undefined);
    let groupId = tiedGroup ?? previous.get(fingerprint.value);
    if (!groupId) {
      groupId = newId();
      newGroups.push({ id: groupId, title: fingerprint.title, firstObservedAt: observedAt });
    }
    owner.set(fingerprint.value, groupId);
    const mapping = { fingerprint: fingerprint.value, groupId, facets: fingerprint.facets };
    mappings.push(mapping);

    for (const other of known) {
      if (other.groupId === groupId) continue;
      const reasons = candidateReasons(fingerprint.facets, other.facets);
      if (!reasons) continue;
      const [groupA, groupB] =
        groupId < other.groupId ? [groupId, other.groupId] : [other.groupId, groupId];
      const key = `${groupA}|${groupB}`;
      if (!candidates.has(key)) candidates.set(key, { groupA, groupB, reasons });
    }
    known.push(mapping);
  }
  return { newGroups, mappings, candidates: [...candidates.values()] };
}

/** For each fingerprint, the earlier group most of its incoming signals came from. */
function previousMajority(incoming: readonly IncomingSignal[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const { fingerprint, previousGroup } of incoming) {
    if (!previousGroup) continue;
    const forFingerprint = counts.get(fingerprint.value) ?? new Map<string, number>();
    forFingerprint.set(previousGroup, (forFingerprint.get(previousGroup) ?? 0) + 1);
    counts.set(fingerprint.value, forFingerprint);
  }
  const majority = new Map<string, string>();
  for (const [value, groups] of counts) {
    const [best] = [...groups].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (best) majority.set(value, best[0]);
  }
  return majority;
}
