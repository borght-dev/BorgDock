import type { Meta, StoryObj } from '@storybook/react-vite';
import clsx from 'clsx';
import { useState } from 'react';
import {
  ACCOUNTS,
  CLAUDE_ACME,
  homeExpiredAt,
  INTRODUCED,
  opsRunOutAt,
  readingsAt,
} from '@/services/ai-usage/__fixtures__/accounts';
import { type AiReading, accountPreferences } from '@/services/ai-usage/model';
import { useAiUsageStore } from '@/stores/ai-usage-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { AiUsageSettings } from '@/types/settings';
import { AiAccountsSheet } from './AiAccountsIntro';
import { AiUsageFocusCard } from './AiUsageFocusCard';
import { RailLimits } from './RailLimits';

interface SceneProps {
  collapsed?: boolean;
  open?: boolean;
  readings?: (nowMs: number) => Record<string, AiReading>;
  settings?: AiUsageSettings;
  accounts?: typeof ACCOUNTS;
  gitHub?: boolean;
}

function seed({
  readings = readingsAt,
  settings = INTRODUCED,
  accounts = ACCOUNTS,
  gitHub = true,
}: SceneProps) {
  const now = Date.now();
  useAiUsageStore.setState({
    accounts,
    looked: true,
    readings: readings(now),
    // Fresh, so opening the card reads nothing in a story.
    lastReadAt: now - 30_000,
    isReading: false,
  });
  const current = useSettingsStore.getState().settings;
  useSettingsStore.setState({ hasLoaded: true, settings: { ...current, aiUsage: settings } });
  usePrStore.setState({
    rateLimit: gitHub
      ? { remaining: 4412, limit: 5000, resetAt: now / 1000 + 1800, pool: 'rest' }
      : null,
  } as Partial<ReturnType<typeof usePrStore.getState>>);
}

/** The foot of the rail, as wide as the rail is. */
function RailScene(props: SceneProps) {
  useState(() => seed(props));
  return (
    <aside
      className={clsx('bd-rail', props.collapsed && 'bd-rail--collapsed')}
      style={{ width: props.collapsed ? 56 : 200, height: 560 }}
    >
      <div className="bd-rail__foot">
        <RailLimits collapsed={!!props.collapsed} defaultOpen={props.open} />
      </div>
    </aside>
  );
}

const meta: Meta<typeof RailScene> = {
  title: 'AI usage/Limits',
  component: RailScene,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof RailScene>;

/** One row per account, least left first, with GitHub's requests among them. */
export const Rail: Story = { args: {} };

/** Folded: a ring per account around the provider's icon. */
export const RailFolded: Story = { args: { collapsed: true } };

/** The card the block opens: plan, limits, the pace tick and the time to each reset. */
export const Card: Story = { args: { open: true } };

/** From the folded rail the card opens beside the rings. */
export const CardFromFoldedRail: Story = { args: { collapsed: true, open: true } };

/** An account whose sign-in expired keeps its last numbers, dimmed, and says what to do. */
export const CardWithExpiredSignIn: Story = { args: { open: true, readings: homeExpiredAt } };

/** One provider: Manage usage is a single link. */
export const CardOneAccount: Story = {
  args: { open: true, accounts: [CLAUDE_ACME], gitHub: false },
};

/** Before the first-start sheet is answered only GitHub's row shows. */
export const RailBeforeTheSheet: Story = { args: { settings: {} } };

/** The saved order kept, an account hidden, and a stricter warning. */
export const RailKeptOrder: Story = {
  args: {
    settings: {
      introduced: true,
      keepOrder: true,
      warnUnder: 30,
      accounts: {
        [CLAUDE_ACME.id]: { label: 'WRK', color: 4, hidden: false },
        [ACCOUNTS[4]!.id]: { label: 'AC', color: 1, hidden: true },
      },
    },
  },
};

function FocusScene(props: SceneProps) {
  useState(() => seed(props));
  return (
    <div style={{ width: 720, background: 'var(--color-background)' }}>
      <AiUsageFocusCard />
    </div>
  );
}

/** On Focus while an account has nothing left. */
export const FocusCardRunOut: StoryObj<typeof FocusScene> = {
  render: (args) => <FocusScene {...args} />,
  args: { readings: opsRunOutAt },
};

function SheetScene() {
  return (
    <div style={{ height: 620 }}>
      <AiAccountsSheet
        accounts={ACCOUNTS}
        suggested={accountPreferences(ACCOUNTS, undefined)}
        onAnswer={() => {}}
      />
    </div>
  );
}

/** The first start after the update: every account found, with a suggested label. */
export const FirstStartSheet: StoryObj<typeof SheetScene> = { render: () => <SheetScene /> };
