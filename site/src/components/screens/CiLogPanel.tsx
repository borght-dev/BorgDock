import { Pill } from '../ui/atoms';
import { StatusDot } from '../ui/atoms';

interface CiLogPanelProps {
  width?: number;
}

export function CiLogPanel({ width = 560 }: CiLogPanelProps) {
  return (
    <div
      className="prdock-card prdock-app"
      style={{ width, padding: 0, overflow: 'hidden', fontFamily: 'var(--font-ui-system)' }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--color-subtle-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <StatusDot status="red" />
        <div style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>CI · test-integration</div>
        <Pill variant="error">failed 43s</Pill>
      </div>
      <div
        style={{
          padding: '12px 14px',
          fontFamily: 'var(--font-code)',
          fontSize: 11,
          lineHeight: 1.65,
          background: 'var(--color-code-block-bg, var(--color-surface-raised))',
          color: 'var(--color-text-secondary)',
          maxHeight: 220,
          overflow: 'auto',
        }}
      >
        <div style={{ color: 'var(--color-text-muted)' }}>× Parsed 1 error from 2,847 log lines</div>
        <div style={{ height: 6 }} />
        <div>
          <span style={{ color: 'var(--color-syntax-comment)' }}>services/cache.test.ts</span>{' '}
          <span style={{ color: 'var(--color-text-muted)' }}>:</span>
          <span style={{ color: 'var(--color-status-red)' }}>42</span>
          <span style={{ color: 'var(--color-text-muted)' }}>:</span>
          <span style={{ color: 'var(--color-status-red)' }}>17</span>
        </div>
        <div style={{ color: 'var(--color-status-red)', marginTop: 4 }}>
          Expected: <span style={{ color: 'var(--color-syntax-string)' }}>&quot;sqlite:///:memory:&quot;</span>
        </div>
        <div style={{ color: 'var(--color-status-red)' }}>
          Received: <span style={{ color: 'var(--color-syntax-string)' }}>undefined</span>
        </div>
        <div style={{ height: 8 }} />
        <div style={{ color: 'var(--color-text-muted)' }}>
          {'  at Object.<anonymous> ('}
          <span style={{ color: 'var(--color-syntax-keyword)' }}>services/cache.test.ts</span>
          {':42:17)'}
        </div>
        <div style={{ color: 'var(--color-text-muted)' }}>{'  at async runTest (runner.ts:88:5)'}</div>
      </div>
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--color-subtle-border)',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            background: 'var(--color-accent)',
            color: 'white',
            border: 0,
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M2 8l4-4 4 4M6 4v10M10 12h4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Send to Claude Code
        </button>
        <button
          type="button"
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 12,
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-subtle-border)',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
          }}
        >
          Copy error
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-code)' }}>
          worktree ready · slot-3
        </span>
      </div>
    </div>
  );
}
