import type { SessionRecord, SessionState } from '@/services/agent-overview-types';
import { groupByRepoWorktree } from '@/services/agent-overview';
import { AgentCard } from './AgentCard';
import { AgentTile } from './AgentTile';
import { RepoMark } from './RepoMark';
import { StateDot } from './StateDot';

interface RepoGroupedProps {
  agents: SessionRecord[];
  density: 'roomy' | 'standard' | 'wall';
}

export function RepoGrouped({ agents, density }: RepoGroupedProps) {
  if (agents.length === 0) return null;
  const grouped = groupByRepoWorktree(agents);

  return (
    <>
      {grouped.map(({ repo, worktrees }) => {
        const repoAgents = worktrees.flatMap((w) => w.agents);
        return (
          <section key={repo} style={{ marginBottom: 18 }}>
            <RepoHeader repo={repo} agents={repoAgents} />

            {density === 'wall' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {repoAgents.map((a) => <AgentTile key={a.sessionId} agent={a} />)}
              </div>
            ) : (
              worktrees.map(({ worktree, branch, agents: list }) => (
                <div key={worktree} style={{ marginBottom: 12 }}>
                  <WorktreeHeader worktree={worktree} branch={branch} agents={list} />
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
                </div>
              ))
            )}
          </section>
        );
      })}
    </>
  );
}

function RepoHeader({ repo, agents }: { repo: string; agents: SessionRecord[] }) {
  const states: SessionState[] = ['working', 'tool', 'finished'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '4px 0' }}>
      <RepoMark repo={repo} size={22} />
      <span style={{ fontSize: 13, fontWeight: 600 }}>{repo}</span>
      <span className="bd-mono" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{agents.length}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--color-subtle-border)' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        {states.map((s) => {
          const c = agents.filter((a) => a.state === s).length;
          if (!c) return null;
          return (
            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
              <StateDot state={s} size={6} />
              <span className="bd-mono">{c}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function WorktreeHeader({
  worktree,
  branch,
  agents,
}: {
  worktree: string;
  branch: string;
  agents: SessionRecord[];
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 11, paddingLeft: 4 }}>
      <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>⎇</span>
      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{worktree}</span>
      <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{branch}</span>
      <span style={{ color: 'var(--color-text-faint)' }}>·</span>
      <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
        {agents.length} session{agents.length === 1 ? '' : 's'}
      </span>
    </div>
  );
}
