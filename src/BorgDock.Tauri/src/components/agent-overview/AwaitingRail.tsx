import type { SessionRecord } from '@/services/agent-overview-types';
import {
  fmtSinceShort,
  groupByRepoWorktree,
  timeSinceTier,
  type Density,
} from '@/services/agent-overview';
import { AgentCard } from './AgentCard';
import { RepoMark } from './RepoMark';

interface AwaitingRailProps {
  agents: SessionRecord[];
  density: Density;
}

const GRID_BY_DENSITY: Record<Density, { minmax: number; gap: number }> = {
  roomy: { minmax: 380, gap: 10 },
  standard: { minmax: 340, gap: 8 },
  wall: { minmax: 260, gap: 8 },
};

export function AwaitingRail({ agents, density }: AwaitingRailProps) {
  if (agents.length === 0) return null;

  const oldest = Math.max(...agents.map((a) => a.stateSinceMs));
  const tier = timeSinceTier(oldest);
  // Always group by repo → worktree, regardless of the page-level grouping
  // toggle. The rail's job is alert-detection; status grouping doesn't
  // make sense here because every card is already "awaiting".
  const grouped = groupByRepoWorktree(agents);
  const grid = GRID_BY_DENSITY[density];
  const cardDensity = density === 'roomy' ? 'comfortable' : 'compact';

  return (
    <section className="ag-alert-rail" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span
          style={{
            width: 22, height: 22, borderRadius: '50%',
            background: 'var(--color-status-yellow)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', flexShrink: 0, fontWeight: 700, fontSize: 13,
          }}
        >
          !
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-warning-badge-fg)' }}>
          {agents.length} session{agents.length === 1 ? '' : 's'} waiting on you
        </span>
        <span style={{ flex: 1 }} />
        <span
          data-testid="awaiting-rail-oldest"
          className={`bd-mono ag-time--${tier}`}
          style={{ fontSize: 11 }}
        >
          oldest {fmtSinceShort(oldest)} ago
        </span>
      </div>

      {grouped.map(({ repo, worktrees }) => {
        const repoAgents = worktrees.flatMap((w) => w.agents);
        const repoOldest = Math.max(...repoAgents.map((a) => a.stateSinceMs));
        const repoTier = timeSinceTier(repoOldest);
        const showWorktreeSubheaders = worktrees.length > 1;
        return (
          <div key={repo} style={{ marginBottom: 10 }}>
            <div className="ag-rail-repo-head">
              <RepoMark repo={repo} size={18} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-warning-badge-fg)' }}>
                {repo}
              </span>
              <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-warning-badge-fg)', opacity: 0.7 }}>
                {repoAgents.length} waiting
              </span>
              <span style={{ flex: 1 }} />
              <span className={`bd-mono ag-time--${repoTier}`} style={{ fontSize: 10 }}>
                oldest {fmtSinceShort(repoOldest)}
              </span>
            </div>

            {worktrees.map(({ worktree, branch, agents: list }) => (
              <div key={worktree}>
                {showWorktreeSubheaders && (
                  <div className="ag-rail-worktree-head">
                    <span style={{ color: 'var(--color-text-tertiary)' }}>⎇</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {worktree}
                    </span>
                    <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                      {branch}
                    </span>
                    <span style={{ color: 'var(--color-text-faint)' }}>·</span>
                    <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                      {list.length} session{list.length === 1 ? '' : 's'}
                    </span>
                  </div>
                )}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(auto-fill, minmax(${grid.minmax}px, 1fr))`,
                    gap: grid.gap,
                    marginLeft: showWorktreeSubheaders ? 12 : 0,
                  }}
                >
                  {list.map((a) => (
                    <AgentCard key={a.sessionId} agent={a} density={cardDensity} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}
