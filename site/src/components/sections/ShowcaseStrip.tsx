import type { ReactNode } from 'react';
import { MainPRsWindow } from '../screens/MainPRsWindow';
import { ResponsiveMock } from '../ui/ResponsiveMock';

interface Pillar {
  icon: ReactNode;
  title: string;
  body: string;
}

const PILLARS: Pillar[] = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="6" cy="6" r="2.4" />
        <circle cx="6" cy="18" r="2.4" />
        <circle cx="18" cy="18" r="2.4" />
        <path d="M6 8.4v7.2M6 15.6c0-4.8 6-4.8 6-9.6M12 6h4" />
      </svg>
    ),
    title: 'GitHub PRs',
    body: 'Ranked live by eight priority signals, grouped by what actually blocks you.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <path d="M3.5 9h17M8 12.5h8M8 15.5h5" />
      </svg>
    ),
    title: 'Azure DevOps',
    body: 'Work items auto-linked by branch or commit, edited inline beside your PRs.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 6h6l2-2h6v14H4z" />
        <path d="M8 11l2 2 4-4" />
      </svg>
    ),
    title: 'Claude Code',
    body: 'A worktree per failing check, with the real error pre-filled as the prompt.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <ellipse cx="12" cy="6" rx="7" ry="2.5" />
        <path d="M5 6v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" />
        <path d="M5 12v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6" />
      </svg>
    ),
    title: 'SQL & Files',
    body: 'Saved connections, read-only by default. Fuzzy match across every clone.',
  },
];

interface Shortcut {
  keys: string;
  label: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: '⌘⇧P', label: 'Toggle dock' },
  { keys: '⌘P', label: 'File palette' },
  { keys: '⌘L', label: 'SQL window' },
  { keys: '⌘⇧B', label: 'Floating badge' },
];

const TRUST: string[] = [
  'Signed installers',
  'No telemetry by default',
  'Offline-first',
  'MIT licensed',
];

export function ShowcaseStrip() {
  return (
    <section style={{ maxWidth: 1280, margin: '40px auto 0', padding: '0 32px' }}>
      <div className="mockup-frame">
        <ResponsiveMock designWidth={1020} designHeight={720}>
          <MainPRsWindow width={1020} height={720} />
        </ResponsiveMock>
      </div>

      <div className="pillar-grid">
        {PILLARS.map((p) => (
          <div key={p.title} className="pillar-grid__item">
            <div className="pillar-grid__icon">{p.icon}</div>
            <div className="pillar-grid__title">{p.title}</div>
            <div className="pillar-grid__body">{p.body}</div>
          </div>
        ))}
      </div>

      <div className="shortcut-strip">
        {SHORTCUTS.map((s) => (
          <div key={s.keys} className="shortcut-strip__item">
            <kbd className="shortcut-strip__keys">{s.keys}</kbd>
            <span className="shortcut-strip__label">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="trust-strip">
        {TRUST.map((t, i) => (
          <span key={t} className="trust-strip__item">
            {i > 0 && <span className="trust-strip__dot" aria-hidden>·</span>}
            {t}
          </span>
        ))}
      </div>
    </section>
  );
}
