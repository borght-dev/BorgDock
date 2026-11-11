import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import {
  LOW_ANSWER,
  REFUND_FILES,
  REFUND_HEAD,
  REFUND_NEXT_HEAD,
  refundAssessment,
  UNKNOWN_ANSWER,
} from './__fixtures__/quick-review-risk';
import { QuickReviewRiskSection, RiskFileStrip, RiskPill } from './QuickReviewRisk';
import './quick-review.css';

/** The card's reading column, at the width a Quick Review card gives it. */
const column =
  (width = 760): Decorator =>
  (Story) => (
    <div
      style={{
        minHeight: '100vh',
        padding: 24,
        background: 'var(--color-background)',
        color: 'var(--color-text-primary)',
      }}
    >
      <div
        className="qr-overview-reading"
        style={{
          maxWidth: width,
          padding: 20,
          border: '1px solid var(--color-separator)',
          borderRadius: 12,
          background: 'var(--color-surface)',
          overflow: 'visible',
        }}
      >
        <Story />
      </div>
    </div>
  );

const PATHS = REFUND_FILES.map((f) => f.filename);
const noop = () => {};

const meta: Meta<typeof QuickReviewRiskSection> = {
  title: 'Focus/Quick review/Regression risk',
  component: QuickReviewRiskSection,
  decorators: [column()],
  args: {
    head: REFUND_HEAD,
    files: PATHS,
    onAssess: noop,
    onOpenCitation: noop,
    onOpenFile: noop,
    onOpenOnGitHub: noop,
    guideNote: 'Guide: 4 chapters',
  },
};
export default meta;
type Story = StoryObj<typeof QuickReviewRiskSection>;

/** High: the highest reason sets the level; its evidence opens with it. */
export const High: Story = {
  args: { view: { kind: 'ready', assessment: refundAssessment() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Its highest reason sets the level:')).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Refunds on orders with a cancelled line' }),
    ).toHaveAttribute('aria-expanded', 'true');
  },
};

export const HighLight: Story = {
  ...High,
  globals: { theme: 'light' },
};

export const HighDark: Story = {
  ...High,
  globals: { theme: 'dark' },
};

/** Opening another reason shows its cited lines from the diff. */
export const EvidenceOpen: Story = {
  args: { view: { kind: 'ready', assessment: refundAssessment() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const title = canvas.getByRole('button', {
      name: 'Shipping refunds split over three or more lines',
    });
    await userEvent.click(title);
    await expect(title).toHaveAttribute('aria-expanded', 'true');
  },
};

/** Low: nothing raises it, and it says what keeps it down and what it read. */
export const Low: Story = {
  args: {
    view: { kind: 'ready', assessment: refundAssessment({ answer: LOW_ANSWER }) },
  },
};

/** Unknown: too little was read, and Unknown is never Low. */
export const Unknown: Story = {
  args: {
    view: { kind: 'ready', assessment: refundAssessment({ answer: UNKNOWN_ANSWER }) },
  },
};

/** Assessing: no level until there is one. */
export const Assessing: Story = {
  args: {
    view: { kind: 'assessing', provider: 'claude', startedAt: Date.now() - 40_000, previous: null },
  },
};

/** Not assessed: automatic assessment is off. */
export const NotAssessed: Story = {
  args: { view: { kind: 'idle', provider: 'claude', previous: null } },
};

/** Failed: the reason, and Try again. Not assessed is not Low. */
export const Failed: Story = {
  args: {
    view: {
      kind: 'failed',
      provider: 'claude',
      error: 'claude exited with code 1: usage limit reached, resets at 14:00',
      failedAt: Date.now() - 60_000,
      previous: null,
    },
  },
};

/** Stale: the head moved; the old assessment shows, marked, with Assess head. */
export const Stale: Story = {
  args: {
    head: REFUND_NEXT_HEAD,
    view: {
      kind: 'idle',
      provider: 'claude',
      previous: refundAssessment({ minutesAgo: 95 }),
    },
  },
};

/** Stale while the new head is assessed. */
export const StaleAssessing: Story = {
  args: {
    head: REFUND_NEXT_HEAD,
    view: {
      kind: 'assessing',
      provider: 'claude',
      startedAt: Date.now() - 12_000,
      previous: refundAssessment({ minutesAgo: 95 }),
    },
  },
};

/** A dependency update gets no guide, and is assessed anyway. */
export const GuideSkipped: Story = {
  args: {
    view: { kind: 'ready', assessment: refundAssessment({ answer: LOW_ANSWER }) },
    guideNote: 'No guide (a dependency update). Risk is assessed anyway.',
  },
};

/** At split-screen width the verdict stacks and reasons lose their side column. */
export const Narrow: Story = {
  args: { view: { kind: 'ready', assessment: refundAssessment() } },
  decorators: [column(420)],
  parameters: { viewport: { defaultViewport: 'mobile2' } },
};

/** The header chip in each state, and the strip above the diff in the walk. */
export const ChipsAndStrip: Story = {
  args: { view: { kind: 'ready', assessment: refundAssessment() } },
  render: () => {
    const high = refundAssessment();
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <RiskPill view={{ kind: 'ready', assessment: high }} />
          <RiskPill
            view={{ kind: 'ready', assessment: refundAssessment({ answer: LOW_ANSWER }) }}
          />
          <RiskPill
            view={{ kind: 'ready', assessment: refundAssessment({ answer: UNKNOWN_ANSWER }) }}
          />
          <RiskPill view={{ kind: 'idle', provider: 'claude', previous: high }} />
          <RiskPill
            view={{ kind: 'assessing', provider: 'claude', startedAt: 1, previous: null }}
          />
          <RiskPill view={{ kind: 'idle', provider: 'claude', previous: null }} />
        </div>
        <div style={{ border: '1px solid var(--color-separator)', borderRadius: 8 }}>
          <RiskFileStrip
            assessment={high}
            path="src/refunds/calculate.ts"
            stale={false}
            onShowReason={noop}
          />
          <RiskFileStrip assessment={high} path="pnpm-lock.yaml" stale={false} />
        </div>
      </div>
    );
  },
};
