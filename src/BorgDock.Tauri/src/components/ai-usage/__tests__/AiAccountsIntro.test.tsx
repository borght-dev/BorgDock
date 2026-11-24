import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve([])) }));
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(() => Promise.resolve()),
  readFromTauriStore: vi.fn(() => Promise.resolve(undefined)),
}));

import { ACCOUNTS, CLAUDE_ACME, CLAUDE_OPS } from '@/services/ai-usage/__fixtures__/accounts';
import { useAiUsageStore } from '@/stores/ai-usage-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { AiUsageSettings } from '@/types/settings';
import { AiAccountsIntro } from '../AiAccountsIntro';

function seed(aiUsage?: AiUsageSettings, setupComplete = true) {
  useAiUsageStore.setState({ accounts: ACCOUNTS, looked: true });
  const settings = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    hasLoaded: true,
    settings: { ...settings, setupComplete, aiUsage },
  });
}

const saved = () => useSettingsStore.getState().settings.aiUsage;

describe('AiAccountsIntro', () => {
  beforeEach(() => seed());

  it('shows every account found with a suggested label', () => {
    render(<AiAccountsIntro />);
    expect(
      screen.getByRole('dialog', { name: 'BorgDock found 5 AI accounts' }),
    ).toBeInTheDocument();
    const labels = screen.getAllByRole('textbox').map((input) => (input as HTMLInputElement).value);
    expect(labels).toEqual(['AC', 'EX', 'OP', 'EX', 'AC']);
    expect(screen.getAllByText('Claude · acme.com')).toHaveLength(2);
    expect(screen.getByText('~/.claude-ops · Max 20x')).toBeInTheDocument();
  });

  it('saves what the sheet shows on Show in the rail', () => {
    render(<AiAccountsIntro />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Label for Claude ~/.claude' }), {
      target: { value: 'wrk!' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'Show Claude ~/.claude-ops in the rail' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show in the rail' }));

    expect(saved()?.introduced).toBe(true);
    expect(saved()?.accounts?.[CLAUDE_ACME.id]).toMatchObject({ label: 'WRK', hidden: false });
    expect(saved()?.accounts?.[CLAUDE_OPS.id]).toMatchObject({ label: 'OP', hidden: true });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the suggestions and shows no account on Not now', () => {
    render(<AiAccountsIntro />);
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: 'ZZ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(saved()?.introduced).toBe(true);
    expect(Object.values(saved()?.accounts ?? {}).every((account) => account.hidden)).toBe(true);
    expect(saved()?.accounts?.[CLAUDE_ACME.id]?.label).toBe('AC');
  });

  it('counts Escape as Not now', () => {
    render(<AiAccountsIntro />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(saved()?.introduced).toBe(true);
    expect(Object.values(saved()?.accounts ?? {}).every((account) => account.hidden)).toBe(true);
  });

  it('steps a label through the colours', () => {
    render(<AiAccountsIntro />);
    fireEvent.click(screen.getByRole('button', { name: 'Change the colour for Claude ~/.claude' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show in the rail' }));
    expect(saved()?.accounts?.[CLAUDE_ACME.id]?.color).toBe(2);
  });

  it('stays away once answered, before setup, and when no account was found', () => {
    seed({ introduced: true });
    const { container, unmount } = render(<AiAccountsIntro />);
    expect(container).toBeEmptyDOMElement();
    unmount();

    seed(undefined, false);
    expect(render(<AiAccountsIntro />).container).toBeEmptyDOMElement();

    seed();
    useAiUsageStore.setState({ accounts: [] });
    expect(render(<AiAccountsIntro />).container).toBeEmptyDOMElement();
  });
});
