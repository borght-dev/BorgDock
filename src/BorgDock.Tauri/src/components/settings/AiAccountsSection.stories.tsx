import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ACCOUNTS, CLAUDE_OPS } from '@/services/ai-usage/__fixtures__/accounts';
import type { AiAccount } from '@/services/ai-usage/types';
import { useAiUsageStore } from '@/stores/ai-usage-store';
import type { AiUsageSettings } from '@/types/settings';
import { AiAccountsSection } from './AiAccountsSection';

interface SceneProps {
  accounts?: AiAccount[];
  initial?: AiUsageSettings;
}

function Scene({ accounts = ACCOUNTS, initial }: SceneProps) {
  useState(() => {
    useAiUsageStore.setState({
      accounts,
      looked: true,
      // The section looks for accounts when it opens; a story has no machine to look at.
      findAccounts: () => Promise.resolve(accounts),
    });
  });
  const [aiUsage, setAiUsage] = useState(initial);
  return (
    <div className="bd-settings-content mx-auto max-w-[720px] px-9 pb-16 pt-7">
      <AiAccountsSection aiUsage={aiUsage} onChange={setAiUsage} />
    </div>
  );
}

const meta: Meta<typeof Scene> = {
  title: 'Settings/AI accounts',
  component: Scene,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof Scene>;

/** Every account found, with its suggested label and colour. */
export const Suggested: Story = { args: {} };

/** A label changed, an account left out of the rail, the order kept. */
export const Edited: Story = {
  args: {
    initial: {
      introduced: true,
      keepOrder: true,
      warnUnder: 15,
      order: [CLAUDE_OPS.id],
      accounts: {
        [CLAUDE_OPS.id]: { label: 'OPS', color: 4, hidden: false },
        [ACCOUNTS[4]!.id]: { label: 'AC', color: 1, hidden: true },
      },
    },
  },
};

/** A machine with no Claude Code or Codex sign-in. */
export const NoAccounts: Story = { args: { accounts: [] } };
