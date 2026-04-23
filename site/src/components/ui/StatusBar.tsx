import { StatusDot } from './atoms';

interface StatusBarProps {
  text?: string;
}

export function StatusBar({ text = 'Updated 12s ago · 23 open · 2 failing' }: StatusBarProps) {
  return (
    <div
      style={{
        borderTop: '1px solid var(--color-subtle-border)',
        padding: '6px 14px',
        fontSize: 10,
        fontFamily: 'var(--font-code)',
        color: 'var(--color-text-muted)',
        background: 'var(--color-status-bar-bg, var(--color-surface-raised))',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <StatusDot status="green" size={6} />
      <span>{text}</span>
    </div>
  );
}
