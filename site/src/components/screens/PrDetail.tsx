import { Avatar, BranchChip, Pill, StatusDot, WorktreeBadge } from '../ui/atoms';
import { TabBar, WindowFrame } from './WindowFrame';
import type { Tab } from './WindowFrame';
import type { StatusKind } from '../ui/types';

interface PrDetailProps {
  width?: number;
  height?: number;
}

interface Check {
  name: string;
  status: StatusKind;
  time: string;
  note?: string;
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'commits', label: 'Commits', count: 1 },
  { id: 'files', label: 'Files', count: 6 },
  { id: 'checks', label: 'Checks', count: 10 },
  { id: 'reviews', label: 'Reviews', count: 3 },
  { id: 'comments', label: 'Comments', count: 3 },
];

const CHECKS: Check[] = [
  { name: 'lint', status: 'green', time: '1m 04s' },
  { name: 'unit-tests', status: 'green', time: '48s' },
  { name: 'typecheck', status: 'green', time: '32s' },
  {
    name: 'integration-tests',
    status: 'red',
    time: '4m 17s',
    note: 'services/cache.test.ts:42 — 2 failed',
  },
  {
    name: 'integration-tests · windows',
    status: 'red',
    time: '5m 02s',
    note: 'services/cache.test.ts:42 — 2 failed',
  },
  { name: 'build · macos', status: 'green', time: '2m 11s' },
  { name: 'build · windows', status: 'green', time: '3m 44s' },
  { name: 'build · linux', status: 'yellow', time: '— queued' },
  { name: 'e2e · chromium', status: 'green', time: '6m 09s' },
  { name: 'coverage', status: 'green', time: '+0.4% vs base' },
];

const sendBtn = {
  fontSize: 10,
  padding: '3px 8px',
  borderRadius: 4,
  background: 'var(--color-accent-subtle)',
  color: 'var(--color-accent)',
  border: '1px solid var(--color-purple-border)',
  fontFamily: 'var(--font-code)',
  fontWeight: 600,
  cursor: 'pointer',
} as const;

const btnPrimary = {
  padding: '7px 14px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 6,
  background: 'var(--color-accent)',
  color: 'white',
  border: 0,
  cursor: 'pointer',
} as const;

const btnSecondary = {
  padding: '7px 14px',
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--color-text-secondary)',
  border: '1px solid var(--color-subtle-border)',
  cursor: 'pointer',
} as const;

export function PrDetail({ width = 820, height = 840 }: PrDetailProps) {
  return (
    <WindowFrame
      title="BorgDock"
      count="9 open"
      width={width}
      height={height}
      statusbar="services/cache.ts · +18 −11 · worktree slot-3"
    >
      <div
        style={{
          padding: '16px 22px 10px',
          borderBottom: '1px solid var(--color-subtle-border)',
          background: 'var(--color-surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-code)', fontSize: 11, color: 'var(--color-text-muted)' }}>
            #1279
          </span>
          <Pill variant="error">build failing</Pill>
          <Pill variant="accent">in review</Pill>
          <WorktreeBadge slot="slot-3" />
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 600,
            lineHeight: 1.35,
            letterSpacing: '-0.01em',
          }}
        >
          Migrate cache layer to SQLite WAL
        </h1>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 10,
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
          }}
        >
          <Avatar initials="mr" />
          <span>mira.raines opened 6 hours ago</span>
          <span style={{ color: 'var(--color-text-faint)' }}>·</span>
          <BranchChip>sqlite-wal</BranchChip>
          <span style={{ color: 'var(--color-text-faint)' }}>→</span>
          <BranchChip>main</BranchChip>
        </div>
      </div>

      <TabBar active="checks" tabs={TABS} />

      <div className="prdock-scroll" style={{ flex: 1, overflow: 'auto', padding: '14px 22px' }}>
        <div className="prdock-card" style={{ padding: 0, overflow: 'hidden' }}>
          {CHECKS.map((c, i) => (
            <div
              key={c.name}
              style={{
                padding: '10px 14px',
                borderTop: i === 0 ? 0 : '1px solid var(--color-separator)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 12,
              }}
            >
              <StatusDot status={c.status} />
              <span style={{ fontFamily: 'var(--font-code)', fontSize: 12 }}>{c.name}</span>
              {c.note && (
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--color-status-red)',
                    fontFamily: 'var(--font-code)',
                  }}
                >
                  {c.note}
                </span>
              )}
              <span style={{ flex: 1 }} />
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--color-text-muted)',
                  fontFamily: 'var(--font-code)',
                }}
              >
                {c.time}
              </span>
              {c.status === 'red' && (
                <button type="button" style={sendBtn}>
                  Send to Claude Code
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <button type="button" style={btnPrimary}>
            Merge when green
          </button>
          <button type="button" style={btnSecondary}>
            Approve
          </button>
          <button type="button" style={btnSecondary}>
            Request changes
          </button>
          <span style={{ flex: 1 }} />
          <span
            style={{
              fontSize: 11,
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-code)',
            }}
          >
            a · r · m
          </span>
        </div>
      </div>
    </WindowFrame>
  );
}
