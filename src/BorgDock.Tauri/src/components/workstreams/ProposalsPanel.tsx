import { Check, X } from 'lucide-react';
import { Button, Pill } from '@/components/shared/primitives';
import { openOriginal } from '@/services/workstreams/actions';
import type { Assessment } from '@/services/workstreams/attention';
import { setProposalItemStatus } from '@/services/workstreams/edits';
import { acceptProposalItem } from '@/services/workstreams/proposals';
import type { Proposal, ProposalItem, WorkstreamDocument } from '@/services/workstreams/types';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { nodeLabel } from './labels';
import { stamp, wsEdit } from './ws-ui';

interface ProposalsPanelProps {
  document: WorkstreamDocument;
  assessment: Assessment | undefined;
  readOnly: boolean;
}

const KIND_LABEL: Record<ProposalItem['kind'], string> = {
  'next-action': 'Next action',
  decision: 'Decision',
  'outcome-evidence': 'Evidence',
  'add-member': 'Add record',
  'set-role': 'Role',
  'new-outcome': 'New outcome',
  risk: 'Risk',
};

function itemText(
  item: ProposalItem,
  document: WorkstreamDocument,
  assessment: Assessment | undefined,
): string {
  switch (item.kind) {
    case 'next-action':
      return item.text ?? '';
    case 'decision': {
      const decision = document.decisions.find((d) => d.id === item.decisionId);
      const choice = item.choose ? nodeLabel(document, assessment, item.choose) : '?';
      return `Keep ${choice}${decision ? `, for "${decision.question}"` : ''}`;
    }
    case 'outcome-evidence': {
      const outcome = document.outcomes.find((o) => o.id === item.outcomeId);
      const evidence = (item.evidence ?? [])
        .map((key) => nodeLabel(document, assessment, key))
        .join(', ');
      return `Confirm "${outcome?.title ?? '?'}" with ${evidence}`;
    }
    case 'add-member':
      return `Add ${item.url} as ${item.role ?? 'supporting'}`;
    case 'set-role':
      return `${item.key ? nodeLabel(document, assessment, item.key) : '?'} becomes ${item.role}`;
    case 'new-outcome':
      return item.title ?? '';
    case 'risk':
      return item.text ?? '';
  }
}

function useParseContext() {
  const ado = useSettingsStore((s) => s.settings.azureDevOps);
  const hosts = useDispatchStore((s) => s.hosts);
  return {
    adoOrganization: ado.organization || null,
    adoProject: ado.project || null,
    environments: hosts.flatMap((h) =>
      h.environmentId ? [{ environmentId: h.environmentId, hostId: h.id }] : [],
    ),
  };
}

/**
 * ProposalsPanel — what a review agent proposed, newest review first. Each
 * proposal is accepted or dismissed on its own; accepting goes through the
 * same edit as your own, labelled as proposed by the agent.
 */
export function ProposalsPanel({ document, assessment, readOnly }: ProposalsPanelProps) {
  const parse = useParseContext();
  const proposal: Proposal | undefined = document.proposals[0];
  const running = document.runs.find((r) => r.kind === 'review' && !r.read);
  if (!proposal && !running) return null;
  const open = proposal?.items.filter((item) => item.status === 'open') ?? [];
  const run = proposal ? assessment?.members.get(proposal.runKey) : undefined;

  return (
    <section className="bd-ws-panel bd-ws-proposals" aria-label="Agent proposals">
      <header className="bd-ws-panel__head">
        <h2 className="bd-ws-panel__title">Agent review</h2>
        {proposal && <span className="bd-ws-muted">{stamp(proposal.at)}</span>}
        {run && (
          <Button variant="ghost" size="sm" onClick={() => openOriginal(run)}>
            Open in T3
          </Button>
        )}
      </header>
      {running && (
        <p className="bd-ws-muted" role="status">
          A review is under way. Its proposals show here when the agent stops.
        </p>
      )}
      {proposal?.message && (
        <div className="bd-ws-proposals__message">
          <p className="bd-ws-muted">The agent answered without proposals:</p>
          <p>{proposal.message}</p>
        </div>
      )}
      {proposal && proposal.items.length > 0 && open.length === 0 && (
        <p className="bd-ws-muted">Every proposal of this review is handled.</p>
      )}
      {open.length > 0 && (
        <ul className="bd-ws-proposals__list">
          {open.map((item) => (
            <li key={item.id}>
              <Pill tone={item.kind === 'risk' ? 'warning' : 'neutral'}>
                {KIND_LABEL[item.kind]}
              </Pill>
              <span className="bd-ws-suggest__text">
                <span>{itemText(item, document, assessment)}</span>
                {item.why && <span className="bd-ws-muted">{item.why}</span>}
              </span>
              {!readOnly && (
                <span className="bd-ws-proposals__actions">
                  {item.kind !== 'risk' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      leading={<Check size={12} />}
                      onClick={() =>
                        wsEdit(document.id, (d, c) => {
                          const current = d.proposals.find((p) => p.id === proposal!.id);
                          if (!current) return { error: 'That proposal is gone.' };
                          return acceptProposalItem(d, current, item, c, parse);
                        })
                      }
                    >
                      Accept
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    leading={<X size={12} />}
                    onClick={() =>
                      wsEdit(document.id, (d) =>
                        setProposalItemStatus(d, proposal!.id, item.id, 'dismissed'),
                      )
                    }
                  >
                    {item.kind === 'risk' ? 'Noted' : 'Dismiss'}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {proposal && proposal.dropped.length > 0 && (
        <p className="bd-ws-muted">
          Left out, not in this workstream: {proposal.dropped.join(', ')}
        </p>
      )}
    </section>
  );
}
