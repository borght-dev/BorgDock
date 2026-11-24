import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve([])) }));
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(() => Promise.resolve()),
  readFromTauriStore: vi.fn(() => Promise.resolve(undefined)),
}));

import {
  ACCOUNTS,
  CLAUDE_ACME,
  INTRODUCED,
  readingsAt,
} from '@/services/ai-usage/__fixtures__/accounts';
import { LOCAL_HOST } from '@/services/dispatch/hosts';
import { useAiUsageStore } from '@/stores/ai-usage-store';
import { useSettingsStore } from '@/stores/settings-store';
import { LaunchAccountHint } from '../LaunchAccountHint';

const text = (container: HTMLElement) => container.textContent?.replace(/\s+/g, ' ').trim();

describe('LaunchAccountHint', () => {
  beforeEach(() => {
    useAiUsageStore.setState({
      accounts: ACCOUNTS,
      looked: true,
      readings: readingsAt(Date.now()),
    });
    const settings = useSettingsStore.getState().settings;
    useSettingsStore.setState({ hasLoaded: true, settings: { ...settings, aiUsage: INTRODUCED } });
  });

  it('says what is left of the account the picked model spends', () => {
    const { container } = render(
      <LaunchAccountHint hostId={LOCAL_HOST.id} modelId="claudeAgent/claude-fable-5" />,
    );
    expect(text(container)).toMatch(/^AC62% of its week left, resets in 4d [89]h\.$/);
    expect(container.querySelector('.bd-ai-launch')).toHaveAttribute('data-tone', 'normal');
  });

  it('warns when the account is nearly out', () => {
    const { container } = render(
      <LaunchAccountHint hostId={LOCAL_HOST.id} modelId="claudeAgent_ops/claude-fable-5" />,
    );
    expect(text(container)).toMatch(/^OPOnly 8% of its week left, resets in 1d [56]h\.$/);
    expect(container.querySelector('.bd-ai-launch')).toHaveAttribute('data-tone', 'critical');
  });

  it('says nothing for another machine, an unknown instance or an unread account', () => {
    const elsewhere = render(<LaunchAccountHint hostId="mini" modelId="claudeAgent/x" />);
    expect(elsewhere.container).toBeEmptyDOMElement();
    const unknown = render(<LaunchAccountHint hostId={LOCAL_HOST.id} modelId="grok/x" />);
    expect(unknown.container).toBeEmptyDOMElement();

    const { [CLAUDE_ACME.id]: _unread, ...readings } = readingsAt(Date.now());
    useAiUsageStore.setState({ readings });
    const unread = render(<LaunchAccountHint hostId={LOCAL_HOST.id} modelId="claudeAgent/x" />);
    expect(unread.container).toBeEmptyDOMElement();
  });
});
