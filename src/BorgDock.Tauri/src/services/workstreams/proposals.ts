import {
  addMembers,
  addOutcome,
  confirmOutcome,
  decide,
  type EditContext,
  type EditResult,
  setMemberRole,
  setNextAction,
  setProposalItemStatus,
} from './edits';
import { type ParseContext, parseReference } from './identity';
import { LIMITS, type Proposal, type ProposalItem, type WorkstreamDocument } from './types';

/**
 * Accept one item of an agent's proposal: it goes through the same edit as
 * your own would, with provenance that the agent proposed it. Accepting a
 * proposed confirmation makes it your confirmation; an agent verifies
 * nothing by itself.
 */
export function acceptProposalItem(
  document: WorkstreamDocument,
  proposal: Proposal,
  item: ProposalItem,
  context: EditContext,
  parse: ParseContext,
): EditResult {
  const applied = applyItem(document, proposal, item, context, parse);
  if ('error' in applied) return applied;
  const marked = setProposalItemStatus(applied.document, proposal.id, item.id, 'accepted');
  if ('error' in marked) return marked;
  const entry = {
    id: crypto.randomUUID(),
    at: context.now,
    device: context.device,
    kind: 'proposal-accepted' as const,
    summary: `Accepted the agent's proposal: ${describeItem(item)}`,
    refs: [proposal.runKey],
  };
  return {
    document: { ...marked.document, log: [entry, ...marked.document.log].slice(0, LIMITS.log) },
  };
}

function applyItem(
  document: WorkstreamDocument,
  proposal: Proposal,
  item: ProposalItem,
  context: EditContext,
  parse: ParseContext,
): EditResult {
  switch (item.kind) {
    case 'next-action':
      return setNextAction(document, item.text ?? '', item.target ?? null, 'agent', context);
    case 'decision':
      if (!item.decisionId || !item.choose) return { error: 'The proposal names no choice.' };
      return decide(document, item.decisionId, item.choose, item.why, context);
    case 'outcome-evidence':
      if (!item.outcomeId) return { error: 'The proposal names no outcome.' };
      return confirmOutcome(
        document,
        item.outcomeId,
        item.evidence ?? [],
        item.why || 'Proposed by the agent.',
        context,
        proposal.runKey,
      );
    case 'add-member': {
      const parsed = item.url ? parseReference(item.url, parse) : null;
      if (!parsed || 'error' in parsed)
        return { error: `BorgDock can't link ${item.url ?? 'that'}.` };
      return addMembers(
        document,
        [
          {
            ref: parsed.ref,
            label: '',
            role: item.role ?? 'supporting',
            note: item.why.slice(0, LIMITS.note),
            addedBy: 'agent',
          },
        ],
        context,
      );
    }
    case 'set-role':
      if (!item.key || !item.role) return { error: 'The proposal names no role.' };
      return setMemberRole(document, item.key, item.role, context);
    case 'new-outcome':
      return addOutcome(document, item.title ?? '', true, [], context);
    case 'risk':
      return { document };
  }
}

/** One proposal item in a line. */
export function describeItem(item: ProposalItem): string {
  switch (item.kind) {
    case 'next-action':
      return `next action "${item.text}"`;
    case 'decision':
      return `keep ${item.choose}`;
    case 'outcome-evidence':
      return `confirm ${item.outcomeId} with ${(item.evidence ?? []).join(', ')}`;
    case 'add-member':
      return `add ${item.url}`;
    case 'set-role':
      return `make ${item.key} ${item.role}`;
    case 'new-outcome':
      return `new outcome "${item.title}"`;
    case 'risk':
      return `risk: ${item.text}`;
  }
}
