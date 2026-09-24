// src/components/shared/primitives/Primitives.stories.tsx
//
// The Workbench primitives in both themes side by side. The `.dark` tokens are
// scoped to a class, so wrapping one panel in `.dark` renders the graphite set
// next to the porcelain one without touching <html>; the stories pin the
// toolbar theme to light so the left panel really is light.

import type { Meta, StoryObj } from '@storybook/react-vite';
import clsx from 'clsx';
import { type ReactNode, useState } from 'react';
import { CheckBar } from './CheckBar';
import { SlidingHighlight } from './SlidingHighlight';

function ThemePanel({ dark, children }: { dark?: boolean; children: ReactNode }) {
  return (
    <div
      className={clsx(
        'flex-1 bg-[var(--color-background)] p-6 text-[13px] text-[var(--color-text-primary)]',
        dark && 'dark',
      )}
      style={{ fontFamily: 'var(--font-ui)' }}
    >
      <div className="mb-4 text-[12px] font-medium text-[var(--color-text-tertiary)]">
        {dark ? 'Dark (graphite)' : 'Light (porcelain)'}
      </div>
      {children}
    </div>
  );
}

function BothThemes({ children }: { children: () => ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <ThemePanel>{children()}</ThemePanel>
      <ThemePanel dark>{children()}</ThemePanel>
    </div>
  );
}

const meta: Meta = {
  title: 'Shared/Primitives',
  globals: { theme: 'light' },
};
export default meta;
type Story = StoryObj;

// ── CheckBar ────────────────────────────────────────────────────────

interface CheckCase {
  title: string;
  ok: number;
  fail: number;
  run: number;
  total: number;
}

const CHECK_CASES: Record<number, CheckCase[]> = {
  6: [
    { title: 'All passing', ok: 6, fail: 0, run: 0, total: 6 },
    { title: 'Two failing', ok: 4, fail: 2, run: 0, total: 6 },
    { title: 'Running', ok: 4, fail: 0, run: 2, total: 6 },
  ],
  12: [
    { title: 'All passing', ok: 12, fail: 0, run: 0, total: 12 },
    { title: 'One failing, others running', ok: 7, fail: 1, run: 4, total: 12 },
    { title: 'Running, one skipped', ok: 8, fail: 0, run: 3, total: 12 },
  ],
  80: [
    { title: 'All passing', ok: 80, fail: 0, run: 0, total: 80 },
    { title: 'Three failing', ok: 77, fail: 3, run: 0, total: 80 },
    { title: 'Mostly running', ok: 20, fail: 0, run: 60, total: 80 },
  ],
};

function CheckBarMatrix() {
  return (
    <div className="grid gap-5">
      {Object.entries(CHECK_CASES).map(([n, cases]) => (
        <section key={n}>
          <h3 className="mb-2 text-[12px] font-semibold text-[var(--color-text-secondary)]">
            {n} checks
          </h3>
          <div className="grid gap-2">
            {cases.map((c) => (
              <div
                key={c.title}
                className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--color-subtle-border)] bg-[var(--color-surface)] px-3 py-2"
              >
                <span className="text-[var(--color-text-secondary)]">{c.title}</span>
                <CheckBar ok={c.ok} fail={c.fail} run={c.run} total={c.total} />
              </div>
            ))}
          </div>
        </section>
      ))}
      <section>
        <h3 className="mb-2 text-[12px] font-semibold text-[var(--color-text-secondary)]">
          No checks
        </h3>
        <CheckBar ok={0} fail={0} run={0} total={0} />
      </section>
    </div>
  );
}

export const CheckBars: Story = {
  render: () => <BothThemes>{() => <CheckBarMatrix />}</BothThemes>,
};

/** A running PR that finishes: click to advance the counts and watch the bar re-split. */
function LiveCheckBar() {
  const steps = [
    { ok: 2, fail: 0, run: 10 },
    { ok: 6, fail: 1, run: 5 },
    { ok: 10, fail: 1, run: 1 },
    { ok: 11, fail: 1, run: 0 },
    { ok: 12, fail: 0, run: 0 },
  ];
  const [i, setI] = useState(0);
  const step = steps[i % steps.length] ?? { ok: 0, fail: 0, run: 0 };
  return (
    <button
      type="button"
      className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-subtle-border)] bg-[var(--color-surface)] px-3 py-2 text-left"
      onClick={() => setI((n) => n + 1)}
    >
      <span className="text-[var(--color-text-secondary)]">Step {(i % steps.length) + 1}</span>
      <CheckBar {...step} total={12} />
    </button>
  );
}

export const CheckBarTransition: Story = {
  render: () => <BothThemes>{() => <LiveCheckBar />}</BothThemes>,
};

// ── SlidingHighlight ────────────────────────────────────────────────

const FILTERS = [
  { key: 'all', label: 'All', count: 18 },
  { key: 'needs-you', label: 'Needs you', count: 4 },
  { key: 'mine', label: 'Mine', count: 6 },
  { key: 'failing', label: 'Failing', count: 2 },
];

function SegmentedDemo() {
  const [active, setActive] = useState('all');
  return (
    <SlidingHighlight
      activeKey={active}
      className="inline-flex rounded-[8px] bg-[var(--color-surface-hover)] p-[2px]"
    >
      {FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          data-highlight-key={f.key}
          aria-pressed={active === f.key}
          onClick={() => setActive(f.key)}
          className={clsx(
            'flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 transition-colors duration-[var(--motion-fast)]',
            active === f.key
              ? 'text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)]',
          )}
        >
          {f.label}
          <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">
            {f.count}
          </span>
        </button>
      ))}
    </SlidingHighlight>
  );
}

const RAIL = ['Focus', 'Pull requests', 'Work items', 'Worktrees'];

function RailDemo() {
  const [active, setActive] = useState('Pull requests');
  return (
    <SlidingHighlight activeKey={active} className="flex w-[200px] flex-col gap-[2px]">
      {RAIL.map((item) => (
        <button
          key={item}
          type="button"
          data-highlight-key={item}
          aria-current={active === item ? 'page' : undefined}
          onClick={() => setActive(item)}
          className={clsx(
            'h-[30px] rounded-[6px] px-2.5 text-left',
            active === item
              ? 'text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)]',
          )}
        >
          {item}
        </button>
      ))}
    </SlidingHighlight>
  );
}

const TABS = ['Overview', 'Checks', 'Files', 'Commits', 'Discussion'];

function TabsDemo() {
  const [active, setActive] = useState('Overview');
  return (
    <SlidingHighlight
      activeKey={active}
      variant="underline"
      role="tablist"
      className="flex gap-4 border-b border-[var(--color-subtle-border)]"
    >
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={active === tab}
          data-highlight-key={tab}
          onClick={() => setActive(tab)}
          className={clsx(
            'py-2',
            active === tab
              ? 'text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)]',
          )}
        >
          {tab}
        </button>
      ))}
    </SlidingHighlight>
  );
}

export const SlidingHighlights: Story = {
  render: () => (
    <BothThemes>
      {() => (
        <div className="grid gap-6">
          <div>
            <div className="mb-2 text-[12px] text-[var(--color-text-tertiary)]">Filter control</div>
            <SegmentedDemo />
          </div>
          <div>
            <div className="mb-2 text-[12px] text-[var(--color-text-tertiary)]">Rail</div>
            <RailDemo />
          </div>
          <div>
            <div className="mb-2 text-[12px] text-[var(--color-text-tertiary)]">Detail tabs</div>
            <TabsDemo />
          </div>
        </div>
      )}
    </BothThemes>
  ),
};
