import type { SessionRecord, SessionState } from '@/services/agent-overview-types';

interface StatusbarProps {
  records: SessionRecord[];
  grouping: 'repo' | 'status';
  effectiveDensity: 'roomy' | 'standard' | 'wall';
  densityIsAuto: boolean;
}

export function Statusbar({ records, grouping, effectiveDensity, densityIsAuto }: StatusbarProps) {
  const c = (s: SessionState) => records.filter((r) => r.state === s).length;
  return (
    <div className="bd-statusbar">
      <span>
        Grouped by {grouping === 'repo' ? 'repo' : 'status'} · density: {effectiveDensity}
        {densityIsAuto ? ' (auto)' : ''}
      </span>
      <span style={{ display: 'flex', gap: 12 }}>
        <Stat tone="yellow" label="awaiting" n={c('awaiting')} />
        <Stat tone="violet" label="working" n={c('working') + c('tool')} />
        <Stat tone="green" label="finished" n={c('finished')} />
        <Stat tone="gray" label="idle" n={c('idle') + c('ended')} />
      </span>
    </div>
  );
}

function Stat({ tone, label, n }: { tone: string; label: string; n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span className={`bd-dot bd-dot--${tone}`} style={{ width: 6, height: 6 }} />
      {label} {n}
    </span>
  );
}
