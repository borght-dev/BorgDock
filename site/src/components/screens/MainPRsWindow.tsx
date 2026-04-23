import { PrCard } from '../ui/PrCard';
import { GroupLabel, TabBar, WindowFrame } from './WindowFrame';
import type { Tab } from './WindowFrame';

interface MainPRsWindowProps {
  width?: number;
  height?: number;
}

const TABS: Tab[] = [
  { id: 'focus', label: 'Focus', count: 7 },
  { id: 'prs', label: 'PRs', count: 23 },
  { id: 'work', label: 'Work Items', count: 14 },
  { id: 'files', label: 'Files' },
  { id: 'sql', label: 'SQL' },
];

const FILTERS: readonly [string, boolean][] = [
  ['All', true],
  ['Mine', false],
  ['Requested', false],
  ['Draft', false],
  ['Needs rebase', false],
];

export function MainPRsWindow({ width = 1020, height = 720 }: MainPRsWindowProps) {
  return (
    <WindowFrame title="BorgDock" count="9 open" width={width} height={height}>
      <TabBar active="prs" tabs={TABS} />

      {/* Filter bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 22px',
          borderBottom: '1px solid var(--color-subtle-border)',
          background: 'var(--color-surface)',
        }}
      >
        {FILTERS.map(([label, on]) => (
          <span
            key={label}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 9999,
              fontWeight: 500,
              background: on ? 'var(--color-accent-subtle)' : 'transparent',
              color: on ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              border: `1px solid ${on ? 'var(--color-purple-border)' : 'var(--color-subtle-border)'}`,
              cursor: 'pointer',
            }}
          >
            {label}
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, fontFamily: 'var(--font-code)', color: 'var(--color-text-muted)' }}>
          sort · priority ↓
        </span>
      </div>

      {/* Grouped list */}
      <div
        className="prdock-scroll"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '10px 22px 20px',
          background: 'var(--color-background)',
        }}
      >
        <GroupLabel>Ready to merge · 2</GroupLabel>
        <div style={{ display: 'grid', gap: 6, marginBottom: 18 }}>
          <PrCard
            status="green"
            mine
            title="Add rate-limit backoff for GitHub polling"
            repo="acme/prdock"
            author="JS"
            branch="gh-polling-backoff"
            number={1284}
            reviewState="approved"
            worktree="slot-2"
            reason={[{ kind: 'green', text: '2 approvals · green' }]}
          />
          <PrCard
            status="green"
            title="Refactor: extract PR store into its own module"
            repo="acme/prdock"
            author="ar"
            branch="extract-pr-store"
            number={1282}
            reviewState="approved"
            reason={[{ kind: 'green', text: '1 approval · green' }]}
          />
        </div>

        <GroupLabel>Needs attention · 3</GroupLabel>
        <div style={{ display: 'grid', gap: 6, marginBottom: 18 }}>
          <PrCard
            status="red"
            title="Migrate cache layer to SQLite WAL"
            repo="acme/prdock"
            author="mr"
            branch="sqlite-wal"
            number={1279}
            pills={[{ variant: 'error', text: '2 failing' }]}
            reason={[
              { kind: 'red', text: 'integration-tests' },
              { kind: null, text: '18 min ago' },
            ]}
          />
          <PrCard
            status="yellow"
            title="Settings: add per-repo priority weights"
            repo="acme/prdock"
            author="hs"
            branch="per-repo-priority"
            number={1271}
            pills={[{ variant: 'warning', text: 'review overdue' }]}
            reason={[{ kind: 'yellow', text: 'Requested 2d ago' }]}
          />
          <PrCard
            status="red"
            mine
            title="File Palette: fuzzy match on path segments"
            repo="acme/prdock"
            author="JS"
            branch="palette-fuzzy"
            number={1260}
            pills={[{ variant: 'error', text: 'changes requested' }]}
            reviewState="changes"
            reason={[{ kind: null, text: 'Awaiting rework · 1d' }]}
          />
        </div>

        <GroupLabel>In review · 4</GroupLabel>
        <div style={{ display: 'grid', gap: 6 }}>
          <PrCard
            status="green"
            title="Quick Review overlay keyboard shortcuts"
            repo="acme/prdock"
            author="ct"
            branch="quick-review-keys"
            number={1266}
            reason={[{ kind: null, text: 'Review requested' }]}
          />
          <PrCard
            status="yellow"
            title="Rework onboarding wizard for ADO setup"
            repo="acme/ui"
            author="no"
            branch="wizard-ado"
            number={1258}
            pills={[{ variant: 'warning', text: 'draft' }]}
            reason={[{ kind: null, text: 'Draft · 4h ago' }]}
          />
          <PrCard
            status="green"
            title="Fix: worktree detach leaves stale refs"
            repo="acme/tauri-db"
            author="pw"
            branch="worktree-detach-fix"
            number={1254}
            reason={[{ kind: null, text: 'Opened 2h ago' }]}
          />
          <PrCard
            status="green"
            title="Docs: caching strategy and WAL trade-offs"
            repo="acme/prdock"
            author="ay"
            branch="docs-caching"
            number={1249}
            reason={[{ kind: null, text: 'Opened 1d ago' }]}
          />
        </div>
      </div>
    </WindowFrame>
  );
}
