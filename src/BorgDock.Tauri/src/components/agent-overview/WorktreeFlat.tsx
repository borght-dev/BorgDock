import type { SessionRecord } from '@/services/agent-overview-types';
import { groupByWorktreeFlat, type Density } from '@/services/agent-overview';
import { AgentCard } from './AgentCard';
import { AgentTile } from './AgentTile';
import { RepoMark } from './RepoMark';

interface WorktreeFlatProps {
  agents: SessionRecord[];
  density: Density;
}

/** Flat list, one row per (repo, worktree) pair. Same nested vocabulary as
 *  RepoGrouped but without the per-repo wrapper — useful when worktree is
 *  the unit you actually care about (long-lived branches, etc.). */
export function WorktreeFlat({ agents, density }: WorktreeFlatProps) {
  if (agents.length === 0) return null;
  const grouped = groupByWorktreeFlat(agents);

  return (
    <>
      {grouped.map(({ repo, worktree, branch, agents: list }) => (
        <section key={`${repo}/${worktree}`} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <RepoMark repo={repo} size={18} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {repo}
            </span>
            <span style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>⎇</span>
            <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: 12 }}>
              {worktree}
            </span>
            <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
              {branch}
            </span>
            <span className="bd-mono" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {list.length}
            </span>
            <span style={{ flex: 1, height: 1, background: 'var(--color-subtle-border)' }} />
          </div>
          {density === 'wall' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {list.map((a) => (
                <AgentTile key={a.sessionId} agent={a} />
              ))}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  density === 'roomy'
                    ? 'repeat(auto-fill, minmax(380px, 1fr))'
                    : 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 10,
              }}
            >
              {list.map((a) => (
                <AgentCard
                  key={a.sessionId}
                  agent={a}
                  density={density === 'roomy' ? 'comfortable' : 'compact'}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  );
}
