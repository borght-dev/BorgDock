import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(() => Promise.resolve()),
  readFromTauriStore: vi.fn(() => Promise.resolve(undefined)),
}));

import { ACCOUNTS, CLAUDE_ACME, CLAUDE_OPS } from '@/services/ai-usage/__fixtures__/accounts';
import { useAiUsageStore } from '@/stores/ai-usage-store';
import type { AiUsageSettings } from '@/types/settings';
import { AiAccountsSection } from '../AiAccountsSection';

let saved: AiUsageSettings | undefined;

function Harness({ initial }: { initial?: AiUsageSettings }) {
  const [aiUsage, setAiUsage] = useState(initial);
  saved = aiUsage;
  return <AiAccountsSection aiUsage={aiUsage} onChange={setAiUsage} />;
}

const labels = () =>
  screen.getAllByRole('textbox').map((input) => (input as HTMLInputElement).value);

describe('AiAccountsSection', () => {
  beforeEach(() => {
    saved = undefined;
    mocks.invoke.mockReset();
    mocks.invoke.mockResolvedValue(ACCOUNTS);
    useAiUsageStore.setState({ accounts: ACCOUNTS, looked: true });
  });

  it('lists the accounts found with their labels, folders and plans', async () => {
    render(<Harness />);
    expect(labels()).toEqual(['AC', 'EX', 'OP', 'EX', 'AC']);
    expect(screen.getByText('~/.codex-acme · Team')).toBeInTheDocument();
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('ai_usage_accounts'));
  });

  it('saves a label, a colour and whether the rail shows the account', () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Label for Claude ~/.claude-ops' }), {
      target: { value: 'ops' },
    });
    fireEvent.click(
      screen
        .getByRole('radiogroup', { name: 'Colour for Claude ~/.claude-ops' })
        .querySelector('[data-color="5"]')!,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Show Claude ~/.claude-ops in the rail' }));

    expect(saved?.accounts?.[CLAUDE_OPS.id]).toEqual({ label: 'OPS', color: 5, hidden: true });
    // An edit here answers the first-start sheet and saves every account, so none counts as new.
    expect(saved?.introduced).toBe(true);
    expect(Object.keys(saved?.accounts ?? {})).toHaveLength(ACCOUNTS.length);
  });

  it('moves an account with the arrow keys on its handle', () => {
    render(<Harness />);
    const handle = screen.getByRole('button', { name: /^Move Claude OP/ });
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(saved?.order?.slice(0, 3)).toEqual([CLAUDE_ACME.id, CLAUDE_OPS.id, ACCOUNTS[1]!.id]);
    expect(labels().slice(0, 3)).toEqual(['AC', 'OP', 'EX']);

    fireEvent.keyDown(screen.getByRole('button', { name: /^Move Claude OP/ }), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByRole('button', { name: /^Move Claude OP/ }), { key: 'ArrowUp' });
    expect(saved?.order?.[0]).toBe(CLAUDE_OPS.id);
  });

  it('saves the rail options', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('switch', { name: 'Show GitHub API with the limits' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Keep my order in the rail' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '20' } });
    expect(saved).toMatchObject({ showGitHub: false, keepOrder: true, warnUnder: 20 });

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } });
    expect(saved?.warnUnder).toBe(20);
  });

  it('puts the suggested labels back and keeps what is hidden', () => {
    render(
      <Harness
        initial={{
          introduced: true,
          accounts: { [CLAUDE_OPS.id]: { label: 'ZZZ', color: 4, hidden: true } },
        }}
      />,
    );
    expect(labels()).toContain('ZZZ');
    fireEvent.click(screen.getByRole('button', { name: 'Reset labels' }));
    expect(saved?.accounts?.[CLAUDE_OPS.id]).toEqual({ label: 'OP', color: 3, hidden: true });
  });

  it('says so when no account was found, and looks again on request', async () => {
    useAiUsageStore.setState({ accounts: [], looked: true });
    mocks.invoke.mockResolvedValue([]);
    render(<Harness />);
    expect(
      await screen.findByText('No Claude Code or Codex sign-in was found on this machine.'),
    ).toBeInTheDocument();
    mocks.invoke.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Look for accounts again' }));
    expect(mocks.invoke).toHaveBeenCalledWith('ai_usage_accounts');
  });
});
