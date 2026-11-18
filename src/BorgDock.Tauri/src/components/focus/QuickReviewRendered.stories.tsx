import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ToastViewport } from '@/components/shared/Toast';
import { utf8ToBase64 } from '@/services/file-preview';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { resetRiskAssessments } from '@/stores/risk-assessment-store';
import { useSettingsStore } from '@/stores/settings-store';
import { getControl } from '../../../.storybook/mocks/control';
import {
  GUIDE_PATH,
  GUIDE_TEXT,
  PLAN_HTML,
  PLAN_PATH,
  RENDERED_BASE,
  RENDERED_BODY,
  RENDERED_FILES,
  RENDERED_HEAD,
  RENDERED_TITLE,
  ROADMAP_HTML,
  ROADMAP_HTML_BEFORE,
  ROADMAP_PATH,
} from './__fixtures__/quick-review-rendered';
import { makePr } from './__tests__/helpers';
import { QuickReviewOverlay } from './QuickReviewOverlay';

const HOUR = 3_600_000;
const pr = {
  ...makePr({
    number: 482,
    repoOwner: 'acme',
    repoName: 'shop',
    title: RENDERED_TITLE,
    headSha: RENDERED_HEAD,
    headRef: 'feature/discount-refusals',
    authorLogin: 'mvisser',
    changedFiles: RENDERED_FILES.length,
    additions: RENDERED_FILES.reduce((n, file) => n + file.additions, 0),
    deletions: RENDERED_FILES.reduce((n, file) => n + file.deletions, 0),
    updatedAt: new Date(Date.now() - 2 * HOUR).toISOString(),
    body: RENDERED_BODY,
  }),
  passedCount: 14,
  totalCheckCount: 14,
};

function textFile(text: string) {
  return { type: 'file', size: text.length, encoding: 'base64', content: utf8ToBase64(text) };
}

function seed() {
  const control = getControl();
  control.githubResponses.getPRReviewDetails = { pr: pr.pullRequest, baseSha: RENDERED_BASE };
  control.githubResponses.getPRFiles = RENDERED_FILES;
  control.githubResponses.getReviews = [];
  control.githubResponses.getAllComments = [];
  control.githubResponses.getRepositoryObject = (path) => {
    if (path.includes('/compare/')) return { merge_base_commit: { sha: RENDERED_BASE } };
    const before = path.endsWith(`ref=${RENDERED_BASE}`);
    if (path.includes(`/contents/${GUIDE_PATH}`)) return textFile(GUIDE_TEXT);
    if (path.includes(`/contents/${PLAN_PATH}`)) return textFile(PLAN_HTML);
    if (path.includes(`/contents/${ROADMAP_PATH}`))
      return textFile(before ? ROADMAP_HTML_BEFORE : ROADMAP_HTML);
    throw new Error(`No fixture for ${path}`);
  };
}

const meta: Meta<typeof QuickReviewOverlay> = {
  title: 'Focus/Quick review/Rendered files',
  component: QuickReviewOverlay,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => {
      seed();
      return (
        <>
          <Story />
          <ToastViewport />
        </>
      );
    },
  ],
  beforeEach: () => {
    const settings = useSettingsStore.getState().settings;
    resetRiskAssessments();
    useSettingsStore.setState({
      settings: { ...settings, summaries: { ...settings.summaries!, autoRiskAssessment: false } },
    });
    for (const preference of ['fullscreen', 'wrap-lines', 'split-diff', 'rendered', 'html-fit']) {
      localStorage.removeItem(`borgdock-quick-review-${preference}`);
    }
    // The page is the subject: the context panel folds to its rail.
    localStorage.setItem('borgdock-quick-review-context-open', 'false');
    localStorage.setItem('borgdock-quick-review-order', 'folders');
    seed();
    useQuickReviewStore.setState({ documents: {}, activity: {} });
    useQuickReviewStore.getState().startSinglePr(pr);
    return () => {
      useQuickReviewStore.getState().endSession();
      useSettingsStore.setState({ settings });
    };
  },
};
export default meta;
type Story = StoryObj<typeof QuickReviewOverlay>;

/** Opens the walk on the file at `path` once the files have loaded. */
async function openFile(canvasElement: HTMLElement, path: string) {
  const canvas = within(canvasElement);
  const start = await canvas.findByRole('button', { name: 'Review files' });
  await waitFor(() => expect(start).toBeEnabled());
  await userEvent.click(start);
  // The tree's own button: the pane's header names the open file too.
  const inTree = () => canvasElement.querySelector<HTMLElement>(`.qr-file[title="${path}"]`);
  await waitFor(() => expect(inTree()).not.toBeNull());
  await userEvent.click(inTree()!);
  return canvas;
}

/** design/rendered-files frame A: a Markdown file as its page, the PR's changes in the margin. */
export const MarkdownRendered: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await openFile(canvasElement, GUIDE_PATH);
    await canvas.findByRole('heading', { name: 'Refusal reasons' });
    await expect(
      within(canvas.getByRole('group', { name: 'File view' })).getByRole('button', {
        name: 'Rendered',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await canvas.findByText('Change 1 of 7');
  },
};
export const MarkdownRenderedLight: Story = { ...MarkdownRendered, globals: { theme: 'light' } };

/** A draft comment sits under the block it is about. */
export const MarkdownWithDraft: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await openFile(canvasElement, GUIDE_PATH);
    await canvas.findByRole('heading', { name: 'Refusal reasons' });
    await userEvent.click(canvas.getByRole('button', { name: 'Comment on lines 11 to 15' }));
    await userEvent.type(
      canvas.getByPlaceholderText('Describe the issue or suggest a change...'),
      'Should `minimum_not_met` name the amount in the currency of the shop, or always in euros?',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save draft' }));
    await canvas.findByRole('region', { name: `Draft on ${GUIDE_PATH} line 15` });
  },
};

/** The same file as a diff: `E`, or Diff in the header. */
export const MarkdownAsDiff: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await openFile(canvasElement, GUIDE_PATH);
    await canvas.findByRole('heading', { name: 'Refusal reasons' });
    await userEvent.click(
      within(canvas.getByRole('group', { name: 'File view' })).getByRole('button', {
        name: 'Diff',
      }),
    );
    await canvas.findByRole('group', { name: 'Diff layout' });
  },
};

/** design/rendered-files frame B: an HTML file in its sandboxed frame; its script draws the phases. */
export const HtmlRendered: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await openFile(canvasElement, PLAN_PATH);
    const frame = await canvas.findByTitle(`After: ${PLAN_PATH}`);
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    await canvas.findByText('Sandboxed');
  },
};
export const HtmlRenderedLight: Story = { ...HtmlRendered, globals: { theme: 'light' } };

/** design/rendered-files frame C: a changed page, before and after. */
export const HtmlSideBySide: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await openFile(canvasElement, ROADMAP_PATH);
    await canvas.findByTitle(`After: ${ROADMAP_PATH}`);
    await userEvent.click(
      within(canvas.getByRole('group', { name: 'Version' })).getByRole('button', {
        name: 'Side by side',
      }),
    );
    await canvas.findByTitle(`Before: ${ROADMAP_PATH}`);
  },
};

/** The overall comment, Request changes and Comment are there before every file is marked. */
export const CommentWhileFilesLeft: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await openFile(canvasElement, 'src/checkout/DiscountField.tsx');
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Overall comment' }),
      'The field shows a raw reason code when the API sends one it does not know.',
    );
    await expect(canvas.getByRole('button', { name: 'Request changes' })).toBeEnabled();
    await expect(canvas.getByRole('button', { name: /^Approve · \d+ left$/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  },
};
export const CommentWhileFilesLeftLight: Story = {
  ...CommentWhileFilesLeft,
  globals: { theme: 'light' },
};
