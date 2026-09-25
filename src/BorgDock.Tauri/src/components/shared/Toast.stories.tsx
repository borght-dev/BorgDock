import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Pill } from '@/components/shared/primitives';
import { showToast, useToastStore } from '@/stores/toast-store';
import { Toast, ToastViewport } from './Toast';

const meta: Meta<typeof ToastViewport> = {
  title: 'Shared/Toast',
  component: ToastViewport,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ height: 320 }}>
        <Story />
      </div>
    ),
  ],
  beforeEach: () => {
    useToastStore.getState().clear();
    return () => useToastStore.getState().clear();
  },
};
export default meta;
type Story = StoryObj<typeof ToastViewport>;

/** Four results in a row: the newest three are drawn, newest at the bottom. */
export const Stack: Story = {
  beforeEach: () => {
    showToast({
      message: 'Merged #468 Worktrees: prune stale slots',
      tone: 'success',
      durationMs: 0,
    });
    showToast({
      message: 'Merge failed: Pull request is not mergeable',
      tone: 'error',
      durationMs: 0,
    });
    showToast({
      message: 'Snoozed #479 until tomorrow',
      actionLabel: 'Undo',
      onAction: () => {},
      durationMs: 0,
    });
    showToast({
      message: 'PR #482...',
      tone: 'progress',
      leading: <Pill tone="success">Merging</Pill>,
      actionLabel: 'Undo',
      onAction: () => {},
      durationMs: 0,
    });
  },
  play: async ({ canvasElement }) => {
    const toasts = canvasElement.querySelectorAll('[data-toast]');
    await expect(toasts).toHaveLength(3);
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent('Merge failed');
  },
};

/** One toast on its own, outside the stack. */
export const Single: Story = {
  render: () => (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <Toast message="Review not submitted: Offline" tone="error" onDismiss={() => {}} />
    </div>
  ),
};
