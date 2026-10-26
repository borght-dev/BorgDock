import { useState } from 'react';
import { Seg2 } from '@/components/shared/primitives';
import type { LogEntry, LogKind, WorkstreamDocument } from '@/services/workstreams/types';
import { stamp } from './ws-ui';

type Filter = 'all' | 'records' | 'outcomes' | 'decisions' | 'next' | 'agents';

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'records', label: 'Records' },
  { value: 'outcomes', label: 'Outcomes' },
  { value: 'decisions', label: 'Decisions' },
  { value: 'next', label: 'Next action' },
  { value: 'agents', label: 'Agents' },
];

const KINDS: Record<Exclude<Filter, 'all'>, readonly LogKind[]> = {
  records: [
    'member-added',
    'member-removed',
    'member-role',
    'relation-added',
    'relation-removed',
    'relinked',
  ],
  outcomes: [
    'outcome-added',
    'outcome-removed',
    'outcome-verified',
    'outcome-confirmed',
    'outcome-invalidated',
    'outcome-unconfirmed',
  ],
  decisions: ['decision-opened', 'decision-decided', 'decision-reopened', 'decision-removed'],
  next: ['next-action'],
  agents: ['run-started', 'proposal-accepted'],
};

function shown(log: readonly LogEntry[], filter: Filter): LogEntry[] {
  if (filter === 'all') return [...log];
  return log.filter((entry) => KINDS[filter].includes(entry.kind));
}

/** ActivityTab — what changed in the workstream, newest first, and on which machine. */
export function ActivityTab({ document }: { document: WorkstreamDocument }) {
  const [filter, setFilter] = useState<Filter>('all');
  const entries = shown(document.log, filter);
  return (
    <div className="bd-ws-activity">
      <Seg2
        ariaLabel="Show activity"
        size="sm"
        value={filter}
        options={FILTERS}
        onChange={setFilter}
      />
      {entries.length === 0 ? (
        <p className="bd-ws-muted">Nothing here yet.</p>
      ) : (
        <ol className="bd-ws-activity__list">
          {entries.map((entry) => (
            <li key={entry.id} data-kind={entry.kind}>
              <time dateTime={entry.at}>{stamp(entry.at)}</time>
              <span className="bd-ws-activity__summary">{entry.summary}</span>
              {entry.device && <span className="bd-ws-muted">{entry.device}</span>}
            </li>
          ))}
        </ol>
      )}
      <p className="bd-ws-muted">The newest 500 changes are kept.</p>
    </div>
  );
}
