import type { Assessment } from '@/services/workstreams/attention';
import { decisionKey, outcomeKey, shortIdentity } from '@/services/workstreams/identity';
import type { NodeKey, WorkstreamDocument } from '@/services/workstreams/types';

/** One line naming a member, outcome or decision of the workstream. */
export function nodeLabel(
  document: WorkstreamDocument,
  assessment: Assessment | undefined,
  key: NodeKey,
): string {
  const resolved = assessment?.members.get(key);
  if (resolved) return `${resolved.identity} ${resolved.title}`.trim();
  const member = document.members.find((m) => m.key === key);
  if (member) return `${shortIdentity(member.ref)} ${member.label}`.trim();
  const outcome = document.outcomes.find((o) => outcomeKey(o.id) === key);
  if (outcome) return `Outcome: ${outcome.title}`;
  const decision = document.decisions.find((d) => decisionKey(d.id) === key);
  if (decision) return `Decision: ${decision.question}`;
  return 'Something no longer in the workstream';
}

/** Every node a relation or a next action can point at, for a picker. */
export function nodeOptions(
  document: WorkstreamDocument,
  assessment: Assessment | undefined,
): { value: NodeKey; label: string }[] {
  return [
    ...document.members.map((m) => ({
      value: m.key,
      label: nodeLabel(document, assessment, m.key),
    })),
    ...document.outcomes.map((o) => ({ value: outcomeKey(o.id), label: `Outcome: ${o.title}` })),
    ...document.decisions.map((d) => ({
      value: decisionKey(d.id),
      label: `Decision: ${d.question}`,
    })),
  ];
}
