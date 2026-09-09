import type { Meta, StoryObj } from '@storybook/react-vite';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import type { PullRequestFileChange } from '@/types';
import { getControl } from '../../../.storybook/mocks/control';
import { makePr } from './__tests__/helpers';
import { QuickReviewOverlay } from './QuickReviewOverlay';

const files: PullRequestFileChange[] = [
  {
    filename: 'FSP.Application.Tests/Orders/SaveOrderHandlerTests.cs',
    status: 'added',
    sha: 'test',
    additions: 3,
    deletions: 0,
    patch:
      '@@ -0,0 +1,3 @@\n+[Fact]\n+public void Saving_does_not_approve()\n+    => Assert.False(Request().ApproveAfterSave);',
  },
  {
    filename: 'src/orders/SaveOrderRequest.cs',
    status: 'modified',
    sha: 'request',
    additions: 1,
    deletions: 0,
    patch:
      '@@ -10,3 +10,4 @@\n public sealed record SaveOrderRequest\n {\n+    public bool ApproveAfterSave { get; init; }\n }',
  },
  {
    filename: 'src/orders/SaveOrderHandler.cs',
    status: 'modified',
    sha: 'handler',
    additions: 8,
    deletions: 1,
    patch:
      '@@ -38,6 +38,13 @@\n public async Task<Result> Handle(SaveOrderRequest request)\n {\n     var order = await orders.Get(request.OrderId);\n+    if (request.ApproveAfterSave)\n+        await permissions.RequireApproval(order);\n+\n     await orders.Save(order);\n-    return Result.Success();\n+\n+    if (request.ApproveAfterSave)\n+        await approvals.Approve(order.Id);\n+\n+    return Result.Success(order.Id);\n }',
  },
  {
    filename: 'src/orders/OrderActions.test.tsx',
    status: 'added',
    sha: 'ui-tests',
    additions: 1,
    deletions: 0,
    patch: '@@ -0,0 +1 @@\n+expect(save).toHaveBeenCalledWith(true);',
  },
  {
    filename: 'docs/orders.md',
    status: 'modified',
    sha: 'docs',
    additions: 1,
    deletions: 1,
    patch:
      '@@ -1 +1 @@\n-Choose Save to store your changes.\n+Choose Save & Approve to save and approve in one step.',
  },
  {
    filename: 'src/orders/OrderActions.tsx',
    status: 'modified',
    sha: 'ui',
    additions: 4,
    deletions: 1,
    patch:
      '@@ -1,3 +1,6 @@\n return (\n-  <Button onClick={save}>Save</Button>\n+  <ActionBar>\n+    <Button onClick={() => save(false)}>Save</Button>\n+    {canApprove && <Button onClick={() => save(true)}>Save & Approve</Button>}\n+  </ActionBar>\n );',
  },
];
const pr = makePr({
  number: 3668,
  repoOwner: 'Gomocha-FSP',
  repoName: 'fsp-horizon',
  title: 'Offer Save & Approve when finishing an order',
  headSha: 'review-head',
  headRef: 'feat/order-approval',
  authorLogin: 'sander',
  changedFiles: files.length,
  body:
    '## Save and approve an order in one step\n\nDispatchers currently save an order, reopen it, and then approve it. This adds a second action alongside Save for people with approval permission.\n\n### What changed\n\n- Add an optional `ApproveAfterSave` flag.\n- Check approval permission before saving.\n- Show **Save & Approve** next to Save.\n\n### Expected behavior\n\n| Action | Result |\n| --- | --- |\n| Save | Stores changes without approving. |\n| Save & Approve | Saves and approves the order. |\n\n### Notes for reviewers\n\nPlease check what happens if approval fails after saving.\n\n' +
    Array.from(
      { length: 8 },
      (_, i) =>
        `### Validation ${i + 1}\n\nConfirm the permission boundary and that existing clients can still save.`,
    ).join('\n\n'),
});

const meta: Meta<typeof QuickReviewOverlay> = {
  title: 'Focus/Quick review',
  component: QuickReviewOverlay,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => {
      const control = getControl();
      control.githubResponses.getPRReviewDetails = { pr: pr.pullRequest, baseSha: 'review-base' };
      control.githubResponses.getPRFiles = files;
      control.githubResponses.getAllComments = [
        {
          id: 'proof',
          author: 'sander',
          body: `## Verification screenshots\n\nThe browser flow passed. This sample screenshot illustrates how proof appears in comments.\n\n![Browser verification](${window.location.origin}/whats-new/1.0.11/close-pr.png)`,
          createdAt: '2026-09-09T12:00:00Z',
          htmlUrl: `${pr.pullRequest.htmlUrl}#issuecomment-1`,
          severity: 'unknown',
        },
        {
          id: 'agent',
          author: 'review-agent[bot]',
          body: 'The handler checks permissions before saving. Please also check the failed-approval case.',
          createdAt: '2026-09-09T11:00:00Z',
          htmlUrl: pr.pullRequest.htmlUrl,
          severity: 'unknown',
          filePath: 'src/orders/SaveOrderHandler.cs',
          lineNumber: 42,
        },
      ];
      control.githubResponses.getReviews = [
        {
          id: 2,
          state: 'COMMENTED',
          body: 'The screenshot makes the two actions clear.',
          submitted_at: '2026-09-09T12:30:00Z',
          user: { login: 'koen' },
        },
      ];
      return <Story />;
    },
  ],
  beforeEach: () => {
    const control = getControl();
    control.githubResponses.getPRReviewDetails = { pr: pr.pullRequest, baseSha: 'review-base' };
    control.githubResponses.getPRFiles = files;
    useQuickReviewStore.setState({ documents: {} });
    useQuickReviewStore.getState().startSinglePr(pr);
    return () => useQuickReviewStore.getState().endSession();
  },
};
export default meta;
type Story = StoryObj<typeof QuickReviewOverlay>;
export const Default: Story = {};
export const LargeDiff: Story = {
  decorators: [
    (Story) => {
      const big = [...files];
      big[2] = {
        ...big[2]!,
        additions: 650,
        deletions: 0,
        patch:
          '@@ -0,0 +1,650 @@\n' +
          Array.from({ length: 650 }, (_, i) => `+const value${i} = ${i};`).join('\n'),
      };
      getControl().githubResponses.getPRFiles = big;
      return <Story />;
    },
  ],
};
export const LoadFailure: Story = {
  decorators: [
    (Story) => {
      getControl().githubResponses.getPRFiles = () =>
        Promise.reject(new Error('Unable to load changed files.'));
      return <Story />;
    },
  ],
};
