import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(() => Promise.resolve([])), openUrl: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: mocks.openUrl }));
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(() => Promise.resolve()),
  readFromTauriStore: vi.fn(() => Promise.resolve(undefined)),
}));

import {
  ACCOUNTS,
  CLAUDE_ACME,
  CLAUDE_HOME,
  homeExpiredAt,
  INTRODUCED,
  readingsAt,
} from '@/services/ai-usage/__fixtures__/accounts';
import { useAiUsageStore } from '@/stores/ai-usage-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { AiUsageSettings } from '@/types/settings';
import { RailLimits } from '../RailLimits';

function seed(aiUsage: AiUsageSettings = INTRODUCED, readings = readingsAt(Date.now())) {
  useAiUsageStore.setState({
    accounts: ACCOUNTS,
    looked: true,
    readings,
    isReading: false,
    lastReadAt: Date.now(),
  });
  const settings = useSettingsStore.getState().settings;
  useSettingsStore.setState({ hasLoaded: true, settings: { ...settings, aiUsage } });
}

function rows(): string[] {
  return [...document.querySelectorAll('.bd-rail__stat')].map((row) =>
    (row.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

describe('RailLimits', () => {
  beforeEach(() => {
    mocks.invoke.mockClear();
    mocks.openUrl.mockClear();
    usePrStore.setState({
      rateLimit: { remaining: 4412, limit: 5000, resetAt: new Date(), pool: 'rest' },
    } as never);
    seed();
  });

  it('lists the accounts least left first, with GitHub where its share puts it', () => {
    render(<RailLimits collapsed={false} />);
    expect(screen.getByText('Limits left')).toBeInTheDocument();
    expect(rows()).toEqual(['OP8%', 'EX22%', 'AC62%', 'GitHub88%', 'EX89%', 'AC100%']);
  });

  it('colours a row by how little is left', () => {
    render(<RailLimits collapsed={false} />);
    const tones = [...document.querySelectorAll('.bd-rail__stat')].map((row) =>
      row.getAttribute('data-tone'),
    );
    expect(tones).toEqual(['critical', 'low', 'normal', 'normal', 'normal', 'normal']);
    expect(document.querySelector('.bd-rail__bar i')).toHaveStyle({ width: '8.00%' });
  });

  it('shows only GitHub before the first-start sheet is answered', () => {
    seed({});
    render(<RailLimits collapsed={false} />);
    expect(rows()).toEqual(['GitHub88%']);
  });

  it('leaves GitHub out when Settings says so, and renders nothing without rows', () => {
    seed({ ...INTRODUCED, showGitHub: false });
    const { unmount } = render(<RailLimits collapsed={false} />);
    expect(rows()).not.toContain('GitHub88%');
    unmount();

    seed({ showGitHub: false });
    const { container } = render(<RailLimits collapsed={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a dash for an account that was never read', () => {
    const { [CLAUDE_ACME.id]: _unread, ...readings } = readingsAt(Date.now());
    seed(INTRODUCED, readings);
    render(<RailLimits collapsed={false} />);
    expect(rows().at(-1)).toBe('AC–');
  });

  it('folds to a ring per account with its label', () => {
    render(<RailLimits collapsed />);
    const rings = [...document.querySelectorAll('.bd-ai-ring')];
    expect(rings).toHaveLength(ACCOUNTS.length);
    expect(rings.map((ring) => ring.querySelector('.bd-ai-badge')?.textContent)).toEqual([
      'OP',
      'EX',
      'AC',
      'EX',
      'AC',
    ]);
    expect(rings[0]!.querySelector('.bd-ai-ring__arc')).toHaveAttribute('data-tone', 'critical');
    expect(screen.queryByText('Limits left')).toBeNull();
  });

  it('opens the card with each account, its limits and the time to each reset', () => {
    render(<RailLimits collapsed={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Limits left' }));

    const card = screen.getByRole('dialog', { name: 'Limits left' });
    expect(within(card).getByText('AI usage')).toBeInTheDocument();
    const ops = card.querySelector('[data-account="claude:~/.claude-ops"]')!;
    expect(ops).toHaveTextContent('Claude');
    expect(ops).toHaveTextContent('~/.claude-ops');
    expect(ops).toHaveTextContent('Max 20x');
    expect(ops).toHaveTextContent(/Weekly8% left1d [56]h/);
    expect(ops).toHaveTextContent('Fable3% left');
    expect(within(card).getByText('45,138')).toBeInTheDocument();
    expect(within(card).getByText('4,412 of 5,000 requests left (REST)')).toBeInTheDocument();
    // The tick marks the share of the week still to come.
    expect(ops.querySelector('.bd-rail__bar u')).toBeInTheDocument();
  });

  it('keeps the last numbers of an account whose sign-in expired and says what to do', () => {
    seed(INTRODUCED, homeExpiredAt(Date.now()));
    render(<RailLimits collapsed={false} defaultOpen />);
    const home = document.querySelector(`[data-account="${CLAUDE_HOME.id}"]`)!;
    expect(home).toHaveAttribute('data-stale');
    expect(home).toHaveTextContent('Weekly22% left');
    expect(home).toHaveTextContent(
      'Open Claude Code with this account to refresh its sign-in. Read 2 d ago.',
    );
  });

  it("opens the provider's usage page and reads again on Refresh", async () => {
    render(<RailLimits collapsed={false} defaultOpen />);
    const card = screen.getByRole('dialog', { name: 'Limits left' });
    fireEvent.click(within(card).getByRole('button', { name: 'Codex' }));
    await vi.waitFor(() =>
      expect(mocks.openUrl).toHaveBeenCalledWith('https://chatgpt.com/codex/settings/usage'),
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Limits left' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(mocks.invoke).toHaveBeenCalledWith('ai_usage_read', {
      ids: ACCOUNTS.map(({ id }) => id),
    });
  });
});
