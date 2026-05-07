// src/components/pr-detail/ReviewComposer.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ReviewComposer } from './ReviewComposer';

const meta: Meta<typeof ReviewComposer> = {
  title: 'PR Detail/ReviewComposer',
  component: ReviewComposer,
};
export default meta;
type Story = StoryObj<typeof ReviewComposer>;

// ReviewComposer is internally stateful (textarea body + decision) — no
// external harness needed. onCancel is also required so supply a no-op.

const noop = () => {};

export const Empty: Story = {
  args: {
    kind: 'review',
    defaultDecision: 'approve',
    onSubmit: fn(),
    onCancel: noop,
  },
};

export const WithComment: Story = {
  args: {
    kind: 'review',
    defaultDecision: 'approve',
    defaultBody: 'Looks good — small nit on naming.',
    onSubmit: fn(),
    onCancel: noop,
  },
};

export const CommentKind: Story = {
  args: {
    kind: 'comment',
    defaultBody: 'Quick note on the implementation.',
    onSubmit: fn(),
    onCancel: noop,
  },
};

export const RequestChanges: Story = {
  args: {
    kind: 'review',
    defaultDecision: 'request',
    defaultBody: 'Please address the naming issues before merging.',
    onSubmit: fn(),
    onCancel: noop,
  },
};

// Click-through stories — exercise the submit path via play functions.
// The submit button label is dynamic: "Comment" for kind=comment,
// "Submit approve" / "Submit request" etc. for kind=review.

export const ApproveClickThrough: Story = {
  args: {
    kind: 'review',
    defaultDecision: 'approve',
    defaultBody: 'LGTM',
    onSubmit: fn(),
    onCancel: noop,
  },
  play: async ({ canvasElement }) => {
    const buttons = canvasElement.querySelectorAll('button');
    const submitBtn = Array.from(buttons).find((b) =>
      /submit/i.test(b.textContent ?? ''),
    );
    submitBtn?.click();
  },
};

export const CommentClickThrough: Story = {
  args: {
    kind: 'comment',
    defaultBody: 'Quick note',
    onSubmit: fn(),
    onCancel: noop,
  },
  play: async ({ canvasElement }) => {
    const buttons = canvasElement.querySelectorAll('button');
    const submitBtn = Array.from(buttons).find((b) =>
      /comment/i.test(b.textContent ?? ''),
    );
    submitBtn?.click();
  },
};
